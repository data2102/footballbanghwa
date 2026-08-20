-- 자주 쓰는 문구 초안.
--
-- 총무가 단톡방에 쓰는 글은 서너 종류뿐이고 매주 숫자만 바뀐다. 그런데 문장을 통째로
-- 저장하면 "매번 쓰기 귀찮다"가 안 풀린다 — 결국 날짜와 인원을 매번 고치게 된다.
-- 그래서 본문에 {날짜} {미투표명단} 같은 자리를 두고, 꺼낼 때 앱이 그 주 값으로 채운다.
--
-- 자리를 채우는 규칙은 앱(src/lib/templates.ts)에 있다. DB 는 글자만 들고 있는다 —
-- 규칙을 DB 에 두면 화면을 고칠 때마다 마이그레이션을 써야 한다.

create type public.message_template_kind as enum ('attendance', 'dues', 'notice');

create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  title      text not null,
  body       text not null,
  kind       public.message_template_kind not null default 'notice',
  -- 최근 쓴 순으로 앞에 둔다. 매주 쓰는 문구가 늘 맨 앞에 있어야 한다.
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index message_templates_team_idx on public.message_templates (team_id, kind);

alter table public.message_templates enable row level security;

-- 문구는 팀원 누구나 본다. 고치는 건 운영진만 — 단톡방에 나가는 글이라
-- 아무나 바꾸면 누가 언제 바꿨는지 아무도 모른다.
create policy message_templates_select on public.message_templates
  for select using (public.is_team_member(team_id));
create policy message_templates_write on public.message_templates
  for all using (public.is_team_staff(team_id)) with check (public.is_team_staff(team_id));
