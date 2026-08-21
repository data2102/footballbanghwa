-- 내 회원 줄을 총무로 올린다.
--
-- 참석 표는 "운영진이거나 자기 자신"만 쓸 수 있게 막혀 있다(RLS). 내 역할이 선수(player)면
-- 남의 참석은 한 줄도 안 들어가고, 앱은 화면만 바꿔 놓아서 저장된 것처럼 보인다.
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행한다.

-- 1) 지금 내 상태 확인
select m.id, m.name, m.role, t.name as team
from public.members m
join public.teams t on t.id = m.team_id
where m.user_id = (select id from auth.users where email = '내메일@example.com');

-- 2) 총무로 올린다 (위에서 확인한 뒤에 실행)
update public.members
set role = 'treasurer'
where user_id = (select id from auth.users where email = '내메일@example.com');

-- 3) 다시 확인
select name, role from public.members
where user_id = (select id from auth.users where email = '내메일@example.com');
