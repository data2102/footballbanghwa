-- 회원 카드: 장점 태그, 감독 메모, 프로필 사진, 가입일

alter table public.members
  add column strengths text[] not null default '{}',
  add column note      text,
  add column photo_url text,
  add column joined_on date;

comment on column public.members.strengths is
  '감독·코치가 기억해 둘 장점 태그. 예: {왼발,헤딩,체력}. 라인업 짤 때 대기 명단에 첫 태그가 보인다.';
comment on column public.members.joined_on is
  '출석률의 분모를 정한다. 가입 전 경기는 그 회원의 출석률 계산에서 뺀다.';

-- 이미 있는 회원은 팀 생성일을 가입일로 본다.
update public.members m
   set joined_on = t.created_at::date
  from public.teams t
 where t.id = m.team_id and m.joined_on is null;

-- ---------------------------------------------------------------- 프로필 사진
-- 사진은 DB가 아니라 스토리지에 둔다. members.photo_url 은 이 버킷의 경로를 가리킨다.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-photos',
  'member-photos',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

/**
 * 경로 규칙: <team_id>/<member_id>.jpg
 * 첫 번째 폴더 이름이 팀 id 라서, 그것만 보고 같은 팀 사람인지 판별할 수 있다.
 */
create policy "팀원은 자기 팀 사진을 본다"
  on storage.objects for select
  using (
    bucket_id = 'member-photos'
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

create policy "운영진은 자기 팀 사진을 올린다"
  on storage.objects for insert
  with check (
    bucket_id = 'member-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );

create policy "운영진은 자기 팀 사진을 바꾼다"
  on storage.objects for update
  using (
    bucket_id = 'member-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );

create policy "운영진은 자기 팀 사진을 지운다"
  on storage.objects for delete
  using (
    bucket_id = 'member-photos'
    and public.is_team_staff(((storage.foldername(name))[1])::uuid)
  );
