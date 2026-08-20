-- 팀이 둘일 때 앱이 아무 쪽이나 잡던 것.
--
-- my_teams() 에 정렬이 없어서 두 팀에 속한 사람은 부를 때마다 다른 팀이 먼저 올 수 있었다.
-- 화면은 첫 줄을 그냥 쓰기 때문에, 실수로 팀을 하나 더 만들면 명단이 통째로 사라진 것처럼 보인다.
-- 실제로 그렇게 보였다 — 아흔 명이 든 팀 대신 갓 만든 빈 팀이 떴다.
--
-- 먼저 만든 팀을 먼저 준다. 처음 만든 팀이 그 사람의 팀인 게 보통이고,
-- 무엇보다 부를 때마다 같은 답이 나온다.
create or replace function public.my_teams()
returns table (id uuid, name text, monthly_due integer, invite_code text, my_role public.member_role)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.name, t.monthly_due, t.invite_code, m.role
  from public.teams t
  join public.members m on m.team_id = t.id
  where m.user_id = auth.uid() and m.active
  order by t.created_at, t.id;
$$;

revoke all on function public.my_teams() from public, anon;
grant execute on function public.my_teams() to authenticated, service_role;
