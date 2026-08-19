-- 스키마와 RLS 가 의도대로 도는지 확인한다.
--
-- 로컬 Supabase 에서:
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/rls_test.sql
--
-- 마이그레이션을 고쳤으면 이걸 돌려 보고 push 한다. 화면으로는 RLS 가 맞는지 알 수 없다 —
-- 권한이 과하게 열려 있어도 앱은 멀쩡히 동작하기 때문이다.

\set ON_ERROR_STOP on
\pset pager off

begin;

-- 테스트용 사람 셋. auth.users 에 직접 넣는다(가입 흐름은 앱이 아니라 Supabase Auth 가 맡는다).
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'manager@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'player@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@test.local')
on conflict (id) do nothing;

/**
 * 로그인한 사용자인 척한다.
 * auth.uid() 는 요청에 실린 JWT 의 sub 클레임을 읽으므로, 그 클레임을 직접 세팅한다.
 */
create or replace function pg_temp.act_as(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ---------------------------------------------------------------- 1. 팀 만들기
do $$ begin perform pg_temp.act_as('11111111-1111-4111-8111-111111111111'); end $$;
select public.create_team('테스트 FC', 30000, '김병준') as team_id \gset

\echo '1. create_team — 팀과 감독 회원이 함께 생겼는가'
select
  (select count(*) from public.teams where id = :'team_id') = 1 as "팀 1개",
  (select length(invite_code) from public.teams where id = :'team_id') = 6 as "초대코드 6자리",
  (select role::text from public.members where team_id = :'team_id') = 'manager' as "감독으로 등록";

-- ---------------------------------------------------------------- 2. 명단 미리 올리기
insert into public.members (team_id, name, role, preferred_position)
values (:'team_id', '이도현', 'player', 'DF');

\echo '2. join_team — 총무가 미리 올려둔 자리에 계정이 붙는가 (새 행이 생기면 안 된다)'
select invite_code from public.teams where id = :'team_id' \gset
do $$ begin perform pg_temp.act_as('22222222-2222-4222-8222-222222222222'); end $$;
select public.join_team(:'invite_code', '이도현');
do $$ begin perform pg_temp.act_as('11111111-1111-4111-8111-111111111111'); end $$;
select
  (select count(*) from public.members where team_id = :'team_id') = 2 as "회원 2명 그대로",
  (select user_id from public.members where name = '이도현')
    = '22222222-2222-4222-8222-222222222222' as "계정 연결됨";

-- ---------------------------------------------------------------- 3. 팀 격리
\echo '3. 남의 팀 사람에게는 아무것도 안 보인다'
do $$ begin perform pg_temp.act_as('33333333-3333-4333-8333-333333333333'); end $$;
select
  (select count(*) from public.teams) = 0 as "팀 안 보임",
  (select count(*) from public.members) = 0 as "회원 안 보임";

-- ---------------------------------------------------------------- 4. 쓰기 권한
\echo '4. 선수는 경기를 못 만든다'
do $$ begin perform pg_temp.act_as('22222222-2222-4222-8222-222222222222'); end $$;
do $$
begin
  insert into public.matches (team_id, date, venue)
  values ((select id from public.teams limit 1), current_date + 3, '테스트 구장');
  raise exception '선수가 경기를 만들 수 있으면 안 된다';
exception
  when insufficient_privilege or check_violation then raise notice '  통과 — 막혔다';
  when others then
    if sqlerrm like '%row-level security%' then raise notice '  통과 — 막혔다';
    else raise; end if;
end $$;

-- ---------------------------------------------------------------- 5. 참석은 본인 것도 고칠 수 있다
do $$ begin perform pg_temp.act_as('11111111-1111-4111-8111-111111111111'); end $$;
insert into public.matches (team_id, date, venue)
values (:'team_id', current_date + 3, '테스트 구장') returning id \gset match_

\echo '5. 선수는 자기 참석만 고친다'
do $$ begin perform pg_temp.act_as('22222222-2222-4222-8222-222222222222'); end $$;
insert into public.attendance (match_id, member_id, status)
values (:'match_id', (select id from public.members where name = '이도현'), 'attending');

do $$
begin
  insert into public.attendance (match_id, member_id, status)
  values ((select id from public.matches limit 1),
          (select id from public.members where name = '김병준'), 'absent');
  raise exception '남의 참석을 고칠 수 있으면 안 된다';
exception
  when insufficient_privilege then raise notice '  통과 — 남의 것은 막혔다';
  when others then
    if sqlerrm like '%row-level security%' then raise notice '  통과 — 남의 것은 막혔다';
    else raise; end if;
end $$;

select (select status::text from public.attendance) = 'attending' as "본인 참석은 저장됨";

-- ---------------------------------------------------------------- 6. 회비 부분 납부
\echo '6. 같은 달 회비를 나눠 내도 두 건이 들어간다'
do $$ begin perform pg_temp.act_as('11111111-1111-4111-8111-111111111111'); end $$;
insert into public.ledger (team_id, member_id, kind, amount, period) values
  (:'team_id', (select id from public.members where name = '김병준'), 'due', 20000, to_char(current_date, 'YYYY-MM')),
  (:'team_id', (select id from public.members where name = '김병준'), 'due', 10000, to_char(current_date, 'YYYY-MM'));
select
  (select count(*) from public.ledger where kind = 'due') = 2 as "두 건 저장됨",
  (select sum(amount) from public.ledger where kind = 'due') = 30000 as "합계 3만원";

-- ---------------------------------------------------------------- 7. 프로필 사진
\echo '7. 사진은 같은 팀만 보고, 운영진만 올린다'
insert into storage.objects (bucket_id, name, owner)
values ('member-photos', :'team_id' || '/aaa.jpg', '11111111-1111-4111-8111-111111111111');

do $$ begin perform pg_temp.act_as('22222222-2222-4222-8222-222222222222'); end $$;
select (select count(*) from storage.objects) = 1 as "같은 팀은 본다";

do $$
begin
  insert into storage.objects (bucket_id, name)
  values ('member-photos', (select id from public.teams limit 1) || '/bbb.jpg');
  raise exception '선수가 사진을 올릴 수 있으면 안 된다';
exception
  when insufficient_privilege then raise notice '  통과 — 선수 업로드는 막혔다';
  when others then
    if sqlerrm like '%row-level security%' then raise notice '  통과 — 선수 업로드는 막혔다';
    else raise; end if;
end $$;

do $$ begin perform pg_temp.act_as('33333333-3333-4333-8333-333333333333'); end $$;
select (select count(*) from storage.objects) = 0 as "남의 팀은 못 본다";

rollback;

\echo ''
\echo '위 결과에 f 가 하나라도 있으면 RLS 가 의도와 다르다.'
