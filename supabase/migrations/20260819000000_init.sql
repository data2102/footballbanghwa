-- 조기축구 팀 운영 앱 기본 스키마
-- 한 사용자가 여러 팀에 속할 수 있고, 모든 데이터는 팀 단위로 격리된다.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- 테이블

create table public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  monthly_due  integer not null default 0 check (monthly_due >= 0),
  invite_code  text not null unique,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create type public.member_role     as enum ('manager', 'coach', 'treasurer', 'player');
create type public.position_group  as enum ('GK', 'DF', 'MF', 'FW');
create type public.entry_source    as enum ('manual', 'ai');

create table public.members (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams (id) on delete cascade,
  -- 앱에 가입하지 않은 회원도 명단에 올릴 수 있어야 하므로 nullable.
  user_id            uuid references auth.users (id) on delete set null,
  name               text not null,
  nickname           text,
  role               public.member_role not null default 'player',
  back_number        integer check (back_number between 0 and 99),
  preferred_position public.position_group,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create unique index members_team_user_idx on public.members (team_id, user_id) where user_id is not null;
create index members_team_idx on public.members (team_id) where active;

create type public.match_status as enum ('scheduled', 'finished', 'canceled');

create table public.matches (
  id        uuid primary key default gen_random_uuid(),
  team_id   uuid not null references public.teams (id) on delete cascade,
  date      date not null,
  kickoff   time not null default '07:00',
  venue     text not null default '',
  opponent  text,
  status    public.match_status not null default 'scheduled',
  note      text,
  created_at timestamptz not null default now()
);

create index matches_team_date_idx on public.matches (team_id, date desc);

create type public.attendance_status as enum ('attending', 'absent', 'late', 'unknown');

create table public.attendance (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  status     public.attendance_status not null default 'unknown',
  note       text,
  source     public.entry_source not null default 'manual',
  updated_at timestamptz not null default now(),
  unique (match_id, member_id)
);

create type public.ledger_kind as enum ('due', 'income', 'expense');

create table public.ledger (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  -- 팀 공동 지출이면 null.
  member_id   uuid references public.members (id) on delete set null,
  kind        public.ledger_kind not null,
  amount      integer not null check (amount > 0),
  -- 회비가 어느 달 몫인지. YYYY-MM.
  period      text check (period ~ '^\d{4}-\d{2}$'),
  occurred_on date not null default current_date,
  memo        text,
  source      public.entry_source not null default 'manual',
  created_at  timestamptz not null default now()
);

create index ledger_team_idx on public.ledger (team_id, occurred_on desc);
-- 같은 사람의 같은 달 회비를 두 번 적는 사고를 막는다.
create unique index ledger_due_once_idx on public.ledger (member_id, period)
  where kind = 'due' and member_id is not null and period is not null;

create type public.match_event_type as enum ('goal', 'assist', 'save', 'yellow', 'red', 'own_goal');

create table public.match_events (
  id        uuid primary key default gen_random_uuid(),
  match_id  uuid not null references public.matches (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  type      public.match_event_type not null,
  minute    integer check (minute between 0 and 130),
  source    public.entry_source not null default 'manual',
  created_at timestamptz not null default now()
);

create index match_events_match_idx on public.match_events (match_id);

create table public.lineups (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null unique references public.matches (id) on delete cascade,
  formation_id text not null,
  -- [{ key, group, x, y, memberId }]
  slots        jsonb not null default '[]'::jsonb,
  bench        jsonb not null default '[]'::jsonb,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- 권한 헬퍼
-- RLS 정책 안에서 members를 직접 조회하면 members 정책이 다시 평가되어 재귀에 빠진다.
-- security definer 함수로 감싸서 끊는다.

create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.team_id = p_team_id and m.user_id = auth.uid() and m.active
  );
$$;

create or replace function public.is_team_staff(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
      and m.active
      and m.role in ('manager', 'coach', 'treasurer')
  );
$$;

/** 경기 id로 팀 권한을 확인한다. attendance/lineups/match_events 정책용. */
create or replace function public.match_team_id(p_match_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.matches where id = p_match_id;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.teams        enable row level security;
alter table public.members      enable row level security;
alter table public.matches      enable row level security;
alter table public.attendance   enable row level security;
alter table public.ledger       enable row level security;
alter table public.match_events enable row level security;
alter table public.lineups      enable row level security;

create policy teams_select on public.teams
  for select using (public.is_team_member(id));
create policy teams_update on public.teams
  for update using (public.is_team_staff(id)) with check (public.is_team_staff(id));

create policy members_select on public.members
  for select using (public.is_team_member(team_id));
create policy members_write on public.members
  for all using (public.is_team_staff(team_id)) with check (public.is_team_staff(team_id));

create policy matches_select on public.matches
  for select using (public.is_team_member(team_id));
create policy matches_write on public.matches
  for all using (public.is_team_staff(team_id)) with check (public.is_team_staff(team_id));

-- 참석은 본인 것이면 선수도 직접 고칠 수 있어야 한다.
create policy attendance_select on public.attendance
  for select using (public.is_team_member(public.match_team_id(match_id)));
create policy attendance_write on public.attendance
  for all using (
    public.is_team_staff(public.match_team_id(match_id))
    or member_id in (select id from public.members where user_id = auth.uid())
  ) with check (
    public.is_team_staff(public.match_team_id(match_id))
    or member_id in (select id from public.members where user_id = auth.uid())
  );

create policy ledger_select on public.ledger
  for select using (public.is_team_member(team_id));
create policy ledger_write on public.ledger
  for all using (public.is_team_staff(team_id)) with check (public.is_team_staff(team_id));

create policy match_events_select on public.match_events
  for select using (public.is_team_member(public.match_team_id(match_id)));
create policy match_events_write on public.match_events
  for all using (public.is_team_staff(public.match_team_id(match_id)))
  with check (public.is_team_staff(public.match_team_id(match_id)));

create policy lineups_select on public.lineups
  for select using (public.is_team_member(public.match_team_id(match_id)));
create policy lineups_write on public.lineups
  for all using (public.is_team_staff(public.match_team_id(match_id)))
  with check (public.is_team_staff(public.match_team_id(match_id)));

-- ---------------------------------------------------------------- 가입 RPC
-- 팀 생성과 초대코드 가입은 RLS로 표현하기 어렵다(가입 전에는 팀원이 아니므로 아무것도 못 본다).
-- security definer RPC로 최소한의 경로만 연다.

create or replace function public.create_team(p_name text, p_monthly_due integer, p_my_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_code    text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  -- 사람이 불러줄 수 있게 헷갈리는 글자(0,O,1,I)를 뺀 6자리.
  loop
    v_code := (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from public.teams where invite_code = v_code);
  end loop;

  insert into public.teams (name, monthly_due, invite_code, created_by)
  values (p_name, coalesce(p_monthly_due, 0), v_code, auth.uid())
  returning id into v_team_id;

  insert into public.members (team_id, user_id, name, role)
  values (v_team_id, auth.uid(), p_my_name, 'manager');

  return v_team_id;
end;
$$;

create or replace function public.join_team(p_invite_code text, p_my_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select id into v_team_id from public.teams where invite_code = upper(trim(p_invite_code));
  if v_team_id is null then
    raise exception '초대코드가 올바르지 않습니다.';
  end if;

  -- 총무가 미리 이름만 올려둔 자리가 있으면 거기에 계정을 연결한다.
  update public.members
     set user_id = auth.uid()
   where team_id = v_team_id
     and user_id is null
     and name = trim(p_my_name);

  if not found then
    insert into public.members (team_id, user_id, name, role)
    values (v_team_id, auth.uid(), trim(p_my_name), 'player')
    on conflict do nothing;
  end if;

  return v_team_id;
end;
$$;

/** 내가 속한 팀 목록. 로그인 직후 팀을 고를 때 쓴다. */
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
  where m.user_id = auth.uid() and m.active;
$$;

revoke execute on function public.create_team(text, integer, text) from anon;
revoke execute on function public.join_team(text, text) from anon;
revoke execute on function public.my_teams() from anon;
