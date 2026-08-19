-- 경기 전날 미응답자에게 보내는 알림.
--
-- "누구에게 보낼지"는 여기(SQL)에서 정하고, Edge Function 은 그 결과를 받아 보내기만 한다.
-- 이렇게 나눠야 대상 선정 로직을 테스트할 수 있다 — 푸시 전송은 로컬에서 확인이 어렵다.

-- ---------------------------------------------------------------- 기기 토큰

create table public.push_tokens (
  -- 같은 사람이 폰과 태블릿을 함께 쓸 수 있으므로 토큰이 키다.
  token      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- 남의 토큰은 보이지도, 지워지지도 않는다.
create policy push_tokens_own on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- 팀 설정

alter table public.teams
  add column reminder_enabled boolean not null default true;

comment on column public.teams.reminder_enabled is
  '경기 전날 미응답자에게 알림을 보낼지. 팀 단위로만 끄고 켠다 — 개인은 알림 권한을 빼면 된다.';

-- 한 경기에 한 번만 보낸다. 스케줄러가 여러 번 돌아도 중복 발송되지 않는다.
alter table public.matches
  add column reminder_sent_at timestamptz;

-- ---------------------------------------------------------------- 대상 선정

/**
 * 곧 있을 경기 중 아직 답을 안 한 사람들을 뽑는다.
 *
 * service_role 로만 부른다(Edge Function). RLS 를 우회해야 모든 팀을 한 번에 훑는다.
 * p_within_hours 안에 킥오프하는 경기가 대상이고, 이미 보낸 경기는 제외한다.
 */
create or replace function public.pending_reminders(p_within_hours integer default 24)
returns table (
  match_id     uuid,
  team_name    text,
  match_date   date,
  kickoff      time,
  venue        text,
  member_id    uuid,
  member_name  text,
  push_token   text,
  platform     text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id, t.name, m.date, m.kickoff, m.venue,
    mem.id, mem.name, pt.token, pt.platform
  from public.matches m
  join public.teams t on t.id = m.team_id
  join public.members mem on mem.team_id = m.team_id and mem.active
  join public.push_tokens pt on pt.user_id = mem.user_id
  left join public.attendance a on a.match_id = m.id and a.member_id = mem.id
  where m.status = 'scheduled'
    and t.reminder_enabled
    and m.reminder_sent_at is null
    -- 이미 지난 경기는 보내지 않는다.
    and (m.date + m.kickoff) between now() and now() + make_interval(hours => p_within_hours)
    -- 답을 안 했거나 "미정"으로 남겨 둔 사람.
    and coalesce(a.status, 'unknown') = 'unknown';
$$;

/** 보냈다고 표시한다. 실패한 경기는 표시하지 않아 다음 회차에 다시 시도된다. */
create or replace function public.mark_reminders_sent(p_match_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.matches set reminder_sent_at = now()
  where id = any(p_match_ids) and reminder_sent_at is null;
$$;

-- ---------------------------------------------------------------- 함수 권한
--
-- 주의: Postgres 는 새 함수의 EXECUTE 를 PUBLIC 에 기본으로 준다.
-- 특정 역할에서만 revoke 하면 PUBLIC 경유로 그대로 실행된다.
-- pending_reminders 는 security definer 라 모든 팀의 회원과 기기 토큰을 돌려주므로,
-- PUBLIC 부터 걷어내고 service_role 에만 다시 준다.

revoke all on function public.pending_reminders(integer) from public, anon, authenticated;
revoke all on function public.mark_reminders_sent(uuid[]) from public, anon, authenticated;
grant execute on function public.pending_reminders(integer) to service_role;
grant execute on function public.mark_reminders_sent(uuid[]) to service_role;

-- 같은 이유로 앞선 마이그레이션의 revoke 도 실제로는 걸리지 않았다. 여기서 다시 잠근다.
-- create_team / join_team 은 로그인한 사용자가 부르는 게 맞으므로 anon 만 막는다.
revoke all on function public.create_team(text, integer, text) from public, anon;
revoke all on function public.join_team(text, text) from public, anon;
revoke all on function public.my_teams() from public, anon;
grant execute on function public.create_team(text, integer, text) to authenticated, service_role;
grant execute on function public.join_team(text, text) to authenticated, service_role;
grant execute on function public.my_teams() to authenticated, service_role;

-- 권한 헬퍼는 RLS 정책 안에서만 쓰인다. 직접 부를 이유가 없다.
revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.is_team_staff(uuid) from public, anon;
revoke all on function public.match_team_id(uuid) from public, anon;
