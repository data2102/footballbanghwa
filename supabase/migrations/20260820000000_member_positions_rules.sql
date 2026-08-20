-- 회원의 포지션을 여러 개로, 연령대를 추가하고, 팀에 회칙을 담는다.
--
-- 조기축구에서 한 사람이 한 자리만 보는 경우는 드물다. 수비도 보고 미드도 보는 사람이
-- 대부분이라 한 칸으로는 실제를 못 담는다. 나이대는 쿼터를 나눌 때 실제로 참고하는 값이다.

-- ---------------------------------------------------------------- 회원

alter table public.members add column positions public.position_group[] not null default '{}';

-- 원래 값(한 개)을 배열 첫 칸으로 옮긴다. 이미 넣어 둔 자료를 잃지 않는다.
update public.members
   set positions = array[preferred_position]
 where preferred_position is not null;

-- preferred_position 은 지우지 않고 남긴다.
-- 옛 앱이 아직 이 칸을 읽을 수 있고, 지웠다가 되돌리는 비용이 크다.
comment on column public.members.preferred_position is
  '더 이상 쓰지 않는다. positions 배열의 첫 칸이 주 포지션이다.';

create type public.age_band as enum ('30', '40', '50', '60');
alter table public.members add column age_band public.age_band;

-- ---------------------------------------------------------------- 팀

alter table public.teams add column rules text;
