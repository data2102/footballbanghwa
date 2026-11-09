-- 회원 명단을 총무 엑셀(풀리스트)과 같은 칸으로 맞춘다.
--
-- 엑셀은 연령대를 "60대 후반"처럼 둘로 나눠 적고, 유니폼 상·하 사이즈와 지급 여부를
-- 같이 들고 있다. 회원 탭의 연령대별 명단·유니폼 현황이 이 칸을 읽는다.
--
-- 초반·후반은 나이에서 계산하지 않는다. 이 팀은 70대도 "60대 후반", 39세도 "40대 초반"
-- 으로 넣는다 — 팀이 정한 칸이 답이라 그대로 받는다.
alter table public.members
  add column if not exists age_half text check (age_half in ('early', 'late')),
  add column if not exists top_size text,
  add column if not exists bottom_size text,
  -- null 은 "모름". 표시가 없는 사람을 받음으로 치면 못 받은 사람이 현황에서 사라진다.
  add column if not exists uniform_issued boolean;

comment on column public.members.age_half is '연령대 안의 초반(early)·후반(late). 팀이 정한 구분.';
comment on column public.members.top_size is '유니폼 상의 사이즈. L, XL, 2XL 처럼 적힌 그대로.';
comment on column public.members.bottom_size is '유니폼 하의 사이즈.';
comment on column public.members.uniform_issued is '유니폼을 받았나. true 받음, false 미지급, null 모름.';
