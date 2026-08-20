-- 라인업을 (경기, 쿼터, 팀) 단위로 바꾸고, 출전 기록을 라인업에서 계산하게 한다.
--
-- 이 팀은 자체경기를 한다. 운동장 화이트보드 한 장에 두 팀이 그려지고, 쿼터마다 사람이 바뀐다.
-- 라인업이 경기당 하나였으니 그 모양을 담을 수 없었다.
--
-- 출전 쿼터를 따로 적던 appearances 테이블은 없앤다. 라인업에 누가 어느 자리에 섰는지가
-- 이미 들어 있어서, 같은 사실을 두 곳에 적으면 반드시 어긋난다.

-- ---------------------------------------------------------------- 라인업

alter table public.lineups add column quarter smallint not null default 1
  check (quarter between 1 and 6);
alter table public.lineups add column side text not null default 'A'
  check (side in ('A', 'B'));
-- 화이트보드 원본. 옮겨 적은 게 맞는지 나중에 대조할 수 있어야 한다.
alter table public.lineups add column photo_path text;

-- 경기당 하나였던 제약을 (경기, 쿼터, 팀) 으로 넓힌다.
alter table public.lineups drop constraint if exists lineups_match_id_key;
drop index if exists lineups_match_id_key;
create unique index lineups_slot_idx on public.lineups (match_id, quarter, side);

-- 교체 명단은 저장하지 않는다. 참석자에서 배치된 사람을 빼면 나오는 값이라
-- 굳이 들고 있으면 라인업을 고칠 때마다 같이 어긋난다.
alter table public.lineups drop column if exists bench;

-- ---------------------------------------------------------------- 출전 기록

drop table if exists public.appearances;

-- ---------------------------------------------------------------- 화이트보드 사진 보관함

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lineup-photos',
  'lineup-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- 회원 사진과 같은 규칙이다. 파일 경로 첫 칸이 팀 id 이고, 그 팀 사람만 본다.
create policy lineup_photo_select on storage.objects
  for select
  using (
    bucket_id = 'lineup-photos'
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

create policy lineup_photo_insert on storage.objects
  for insert
  with check (
    bucket_id = 'lineup-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );

create policy lineup_photo_update on storage.objects
  for update
  using (
    bucket_id = 'lineup-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );

create policy lineup_photo_delete on storage.objects
  for delete
  using (
    bucket_id = 'lineup-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );
