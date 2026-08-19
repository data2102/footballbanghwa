-- 출전 쿼터, 익명 MVP, 그리고 가입 없이 여는 참석 링크.
--
-- 셋 다 조기축구 팀 운영에서 실제로 말이 나오는 지점이다:
--   - 출전 쿼터: 라인업 갈등의 원인은 포메이션이 아니라 "누가 더 뛰었나" 다.
--   - MVP: 한 명 뽑는 재미는 있되, 누가 찍었는지는 남기지 않는다.
--   - 참석 링크: 팀원 열여섯을 전부 가입시키는 게 도입의 가장 큰 장벽이다.

-- ---------------------------------------------------------------- 출전 쿼터

create table public.appearances (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  -- 조기축구는 보통 3~4쿼터를 돈다. 6을 넘으면 오타로 본다.
  quarter    smallint not null check (quarter between 1 and 6),
  source     public.entry_source not null default 'manual',
  created_at timestamptz not null default now(),
  unique (match_id, member_id, quarter)
);

create index appearances_match_idx on public.appearances (match_id);

alter table public.appearances enable row level security;

create policy appearances_select on public.appearances
  for select using (public.is_team_member(public.match_team_id(match_id)));
create policy appearances_write on public.appearances
  for all using (public.is_team_staff(public.match_team_id(match_id)))
  with check (public.is_team_staff(public.match_team_id(match_id)));

-- ---------------------------------------------------------------- MVP

-- ballot 은 기기마다 무작위로 만든 값이다. 사람을 되짚을 수 없고,
-- 한 기기가 두 번 넣거나 표를 옮기는 것만 가려낸다.
create table public.potm_votes (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  ballot     text not null,
  created_at timestamptz not null default now(),
  unique (match_id, ballot)
);

create index potm_votes_match_idx on public.potm_votes (match_id);

alter table public.potm_votes enable row level security;

-- 표는 팀원 누구나 넣을 수 있다. 운영진만 넣을 수 있으면 투표가 아니다.
create policy potm_votes_select on public.potm_votes
  for select using (public.is_team_member(public.match_team_id(match_id)));
create policy potm_votes_write on public.potm_votes
  for all using (public.is_team_member(public.match_team_id(match_id)))
  with check (public.is_team_member(public.match_team_id(match_id)));

-- ---------------------------------------------------------------- 참석 링크

alter table public.matches add column share_token text unique;

-- ---------------------------------------------------------------- 링크로 여는 경로
--
-- 여기 두 함수만은 anon 이 부를 수 있어야 한다. 링크를 누르는 사람은 로그인이 없다.
-- 대신 노출 범위를 경기 하나로 못 박는다:
--   - 팀 이름, 그 경기의 시간·장소·상대, 그 팀 회원의 "이름과 참석 상태"만 나간다.
--   - 회비, 다른 경기, 연락처, user_id 는 어떤 경로로도 나가지 않는다.
--   - 토큰이 없으면 아무것도 돌려주지 않는다(오류 문구로 존재 여부를 알려 주지도 않는다).

create or replace function public.ballot_by_share_token(p_token text)
returns table (
  team_name  text,
  match_date date,
  kickoff    time,
  venue      text,
  opponent   text,
  members    jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.name,
    m.date,
    m.kickoff,
    m.venue,
    m.opponent,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id', mem.id,
                   'name', mem.name,
                   'status', coalesce(a.status::text, 'unknown')
                 )
                 order by mem.name
               )
        from public.members mem
        left join public.attendance a
          on a.match_id = m.id and a.member_id = mem.id
        where mem.team_id = t.id and mem.active
      ),
      '[]'::jsonb
    )
  from public.matches m
  join public.teams t on t.id = m.team_id
  where m.share_token = p_token
    and p_token is not null
    -- 지난 경기의 링크는 열리지 않는다. 링크는 오래 돌아다닌다.
    and m.date >= (current_date - interval '1 day')
    and m.status <> 'canceled';
$$;

create or replace function public.vote_by_share_token(
  p_token  text,
  p_member uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match uuid;
  v_team  uuid;
begin
  if p_status not in ('attending', 'absent', 'late', 'unknown') then
    raise exception 'BAD_STATUS';
  end if;

  select m.id, m.team_id into v_match, v_team
  from public.matches m
  where m.share_token = p_token
    and p_token is not null
    and m.date >= (current_date - interval '1 day')
    and m.status <> 'canceled';

  if v_match is null then
    raise exception 'EXPIRED';
  end if;

  -- 토큰이 가리키는 팀의 회원인지 반드시 확인한다.
  -- 이게 없으면 남의 팀 회원 id 를 넣어 다른 팀 참석을 바꿀 수 있다.
  if not exists (
    select 1 from public.members
    where id = p_member and team_id = v_team and active
  ) then
    raise exception 'NOT_FOUND';
  end if;

  insert into public.attendance (match_id, member_id, status, source, updated_at)
  values (v_match, p_member, p_status::public.attendance_status, 'manual', now())
  on conflict (match_id, member_id)
  do update set status = excluded.status, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------- 권한
--
-- Postgres 는 새 함수의 EXECUTE 를 PUBLIC 에 기본으로 준다.
-- 특정 역할에서만 revoke 하면 PUBLIC 경유로 그대로 실행되므로, 먼저 PUBLIC 을 걷어낸다.
revoke all on function public.ballot_by_share_token(text) from public, anon, authenticated;
revoke all on function public.vote_by_share_token(text, uuid, text) from public, anon, authenticated;

-- 이 둘만은 anon 에게 연다. 링크를 누르는 사람은 로그인이 없다.
grant execute on function public.ballot_by_share_token(text) to anon, authenticated, service_role;
grant execute on function public.vote_by_share_token(text, uuid, text) to anon, authenticated, service_role;
