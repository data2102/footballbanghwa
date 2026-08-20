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

-- ---------------------------------------------------------------- 8. 쿼터별 라인업
\echo '8. 라인업은 (경기, 쿼터, 팀) 하나에 하나. 운영진만 적고, 팀원은 본다'
do $$ begin perform pg_temp.act_as('11111111-1111-4111-8111-111111111111'); end $$;
insert into public.lineups (match_id, quarter, side, formation_id, slots) values
  (:'match_id', 1, 'A', '3-3-1', '[]'::jsonb),
  (:'match_id', 1, 'B', '3-3-1', '[]'::jsonb),
  (:'match_id', 2, 'A', '3-3-1', '[]'::jsonb);
select (select count(*) from public.lineups) = 3 as "운영진이 적은 세 판";

-- 같은 경기·쿼터·팀에 두 판이 생기면 출전 계산이 두 배가 된다.
do $$
begin
  insert into public.lineups (match_id, quarter, side, formation_id, slots)
  values ((select id from public.matches limit 1), 1, 'A', '4-3-3', '[]'::jsonb);
  raise exception '같은 쿼터·팀에 두 판이 들어가면 안 된다';
exception
  when unique_violation then raise notice '  통과 — 한 쿼터 한 팀에 한 판';
end $$;

do $$ begin perform pg_temp.act_as('22222222-2222-4222-8222-222222222222'); end $$;
select (select count(*) from public.lineups) = 3 as "팀원은 본다";
do $$
begin
  insert into public.lineups (match_id, quarter, side, formation_id, slots)
  values ((select id from public.matches limit 1), 3, 'A', '3-3-1', '[]'::jsonb);
  raise exception '선수가 라인업을 적을 수 있으면 안 된다';
exception
  when insufficient_privilege then raise notice '  통과 — 선수 입력은 막혔다';
  when others then
    if sqlerrm like '%row-level security%' then raise notice '  통과 — 선수 입력은 막혔다';
    else raise; end if;
end $$;

do $$ begin perform pg_temp.act_as('33333333-3333-4333-8333-333333333333'); end $$;
select (select count(*) from public.lineups) = 0 as "남의 팀은 못 본다";

-- ---------------------------------------------------------------- 9. MVP
\echo '9. MVP 는 팀원 누구나 한 표, 같은 기기는 한 표까지'
do $$ begin perform pg_temp.act_as('22222222-2222-4222-8222-222222222222'); end $$;
insert into public.potm_votes (match_id, member_id, ballot)
values (:'match_id', (select id from public.members where name = '김병준'), 'ballot-a');
select (select count(*) from public.potm_votes) = 1 as "선수도 표를 넣는다";

do $$
begin
  insert into public.potm_votes (match_id, member_id, ballot)
  values ((select id from public.matches limit 1), (select id from public.members where name = '이도현'), 'ballot-a');
  raise exception '같은 기기가 두 표를 넣을 수 있으면 안 된다';
exception
  when unique_violation then raise notice '  통과 — 한 기기 한 표';
end $$;

-- ---------------------------------------------------------------- 9-2. 물품 재고
\echo '9-2. 물품 재고는 운영진만 고치고, 팀원은 본다'
do $$ begin perform pg_temp.act_as('11111111-1111-4111-8111-111111111111'); end $$;
insert into public.inventory (team_id, name, quantity)
values ((select id from public.teams limit 1), '조끼(주황)', 12);
select (select count(*) from public.inventory) = 1 as "운영진이 넣은 품목";

do $$ begin perform pg_temp.act_as('22222222-2222-4222-8222-222222222222'); end $$;
select (select count(*) from public.inventory) = 1 as "팀원은 본다";
do $$
begin
  update public.inventory set quantity = 0;
  if found then raise exception '선수가 재고를 고칠 수 있으면 안 된다'; end if;
  raise notice '  통과 — 선수 수정은 막혔다(0행)';
exception
  when insufficient_privilege then raise notice '  통과 — 선수 수정은 막혔다';
  when others then
    if sqlerrm like '%row-level security%' then raise notice '  통과 — 선수 수정은 막혔다';
    else raise; end if;
end $$;

do $$ begin perform pg_temp.act_as('33333333-3333-4333-8333-333333333333'); end $$;
select (select count(*) from public.inventory) = 0 as "남의 팀은 못 본다";

-- ---------------------------------------------------------------- 10. 참석 링크
\echo '10. 참석 링크는 그 경기만 열고, 회비는 못 본다'
do $$ begin perform pg_temp.act_as('11111111-1111-4111-8111-111111111111'); end $$;
update public.matches set share_token = 'tok-live', date = current_date + 3 where id = :'match_id';

-- 로그인하지 않은 사람인 척한다. 링크를 누르는 사람에게는 JWT 가 없다.
create or replace function pg_temp.act_as_anon() returns void
language plpgsql as $$
begin
  -- 로그인하지 않은 요청에도 claims 는 있고 sub 만 없다. auth.uid() 가 null 이 된다.
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

do $$ begin perform pg_temp.act_as_anon(); end $$;
select
  (select count(*) from public.ballot_by_share_token('tok-live')) = 1 as "토큰으로 경기가 열린다",
  (select jsonb_array_length(members) from public.ballot_by_share_token('tok-live')) = 2 as "회원 2명이 보인다",
  (select count(*) from public.ballot_by_share_token('tok-wrong')) = 0 as "틀린 토큰은 빈 결과";

-- 링크를 가진 사람이 테이블을 직접 읽을 수는 없어야 한다.
-- 권한 자체가 없어 오류가 나거나(정책이 부르는 헬퍼를 못 씀), 읽혀도 0행이어야 한다.
-- 둘 다 "데이터가 안 나온다"는 같은 결과다.
do $$
declare
  tbl text;
  n   bigint;
  leaked text[] := '{}';
begin
  foreach tbl in array array['ledger', 'members', 'matches', 'attendance', 'lineups', 'potm_votes', 'inventory'] loop
    begin
      execute format('select count(*) from public.%I', tbl) into n;
      if n > 0 then leaked := leaked || tbl; end if;
    exception
      when insufficient_privilege then null; -- 아예 못 읽는다. 더 강한 차단이다.
    end;
  end loop;
  if array_length(leaked, 1) is not null then
    raise exception '링크만 가진 사람에게 % 가 보인다', array_to_string(leaked, ', ');
  end if;
  raise notice '  통과 — 링크로는 어떤 테이블도 읽히지 않는다';
end $$;

\echo '10-2. 링크로 참석을 남기면 저장되고, 남의 팀 회원은 막힌다'
-- 링크를 누른 사람이 아는 회원 id 는 오직 ballot 이 준 것뿐이다. 테이블을 못 읽으니 그게 맞다.
select (members -> 0 ->> 'id') as voter from public.ballot_by_share_token('tok-live') \gset

select public.vote_by_share_token('tok-live', :'voter', 'attending');
select
  (select (m ->> 'status') = 'attending'
     from public.ballot_by_share_token('tok-live'),
          lateral jsonb_array_elements(members) m
    where m ->> 'id' = :'voter') as "링크에도 참석으로 보인다";

do $$
begin
  perform public.vote_by_share_token('tok-live', gen_random_uuid(), 'attending');
  raise exception '토큰이 가리키는 팀 밖의 회원을 바꿀 수 있으면 안 된다';
exception
  when others then
    if sqlerrm = 'NOT_FOUND' then raise notice '  통과 — 다른 팀 회원은 막혔다';
    else raise; end if;
end $$;

do $$
declare v uuid;
begin
  -- 링크를 가진 사람이 알 수 있는 유일한 경로로 회원 id 를 얻는다.
  select (members -> 0 ->> 'id')::uuid into v from public.ballot_by_share_token('tok-live');
  perform public.vote_by_share_token('tok-live', v, 'HACK');
  raise exception '아무 상태나 넣을 수 있으면 안 된다';
exception
  when others then
    if sqlerrm = 'BAD_STATUS' then raise notice '  통과 — 이상한 상태는 막혔다';
    else raise; end if;
end $$;

\echo '10-3. 지난 경기 링크는 열리지 않는다'
do $$ begin perform pg_temp.act_as('11111111-1111-4111-8111-111111111111'); end $$;
update public.matches set date = current_date - 7 where id = :'match_id';
do $$ begin perform pg_temp.act_as_anon(); end $$;
select (select count(*) from public.ballot_by_share_token('tok-live')) = 0 as "지난 경기는 안 열린다";
do $$
begin
  -- 토큰부터 확인하므로 회원 id 가 무엇이든 EXPIRED 에서 걸려야 한다.
  perform public.vote_by_share_token('tok-live', gen_random_uuid(), 'attending');
  raise exception '지난 경기에 참석을 남길 수 있으면 안 된다';
exception
  when others then
    if sqlerrm = 'EXPIRED' then raise notice '  통과 — 만료된 링크는 막혔다';
    else raise; end if;
end $$;

-- ---------------------------------------------------------------- 11. 링크 말고는 아무것도 못 부른다
\echo '11. 로그인 없는 사람이 부를 수 있는 함수는 링크용 둘뿐이다'
do $$
declare
  fn text;
  blocked int := 0;
begin
  foreach fn in array array[
    'select public.my_teams()',
    'select public.is_team_member(gen_random_uuid())',
    'select public.is_team_staff(gen_random_uuid())',
    'select public.match_team_id(gen_random_uuid())',
    'select public.pending_reminders(24)',
    'select public.create_team(''x'', 0, ''y'')'
  ] loop
    begin
      execute fn;
      raise exception '로그인 없이 % 를 부를 수 있으면 안 된다', fn;
    exception
      when insufficient_privilege then blocked := blocked + 1;
    end;
  end loop;
  raise notice '  통과 — % 개 함수 모두 막혔다', blocked;
end $$;

rollback;

\echo ''
\echo '위 결과에 f 가 하나라도 있으면 RLS 가 의도와 다르다.'
