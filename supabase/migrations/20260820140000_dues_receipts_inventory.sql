-- 연납·영수증·물품 재고.
--
-- 세 가지가 같은 뿌리에서 나왔다 — 총무가 돈과 물건을 손으로 기억하고 있다는 것.
-- 연납한 사람을 매달 미납으로 세고, 구장비 영수증은 카톡 어딘가에 묻히고,
-- 조끼가 몇 벌 남았는지는 매주 세어 본다.

-- ---------------------------------------------------------------- 회비

-- 연납 금액. 월 회비 × 12 보다 싸게 두는 게 보통이라 따로 들고 있어야 한다.
alter table public.teams add column annual_due integer not null default 200000
  check (annual_due >= 0);
alter table public.teams alter column monthly_due set default 20000;

-- 이 한 줄이 몇 달치인지. 금액을 달수로 나누지 않는다 — 연납은 할인이라
-- 나누면 매달 조금씩 모자란 것처럼 보인다. 달수는 "이 달이 채워졌는가"에만 쓴다.
alter table public.ledger add column months smallint not null default 1
  check (months between 1 and 12);

-- 영수증·찬조 캡처. 나중에 "이 돈이 뭐였지"를 되짚을 수 있어야 한다.
alter table public.ledger add column photo_path text;

-- ---------------------------------------------------------------- 물품 재고

create table public.inventory (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  name       text not null,
  quantity   integer not null default 0 check (quantity >= 0),
  note       text,
  updated_at timestamptz not null default now()
);

create index inventory_team_idx on public.inventory (team_id);

alter table public.inventory enable row level security;

create policy inventory_select on public.inventory
  for select using (public.is_team_member(team_id));
create policy inventory_write on public.inventory
  for all using (public.is_team_staff(team_id)) with check (public.is_team_staff(team_id));

-- ---------------------------------------------------------------- 영수증 보관함

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipt-photos',
  'receipt-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 회원 사진·화이트보드와 같은 규칙이다. 파일 경로 첫 칸이 팀 id 이고, 그 팀 사람만 본다.
create policy receipt_photo_select on storage.objects
  for select
  using (
    bucket_id = 'receipt-photos'
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

create policy receipt_photo_insert on storage.objects
  for insert
  with check (
    bucket_id = 'receipt-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );

create policy receipt_photo_update on storage.objects
  for update
  using (
    bucket_id = 'receipt-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );

create policy receipt_photo_delete on storage.objects
  for delete
  using (
    bucket_id = 'receipt-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );
