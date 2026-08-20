-- 총무가 몇 해 동안 엑셀에 세 온 걸 그대로 담기 위한 두 가지.
--
-- 이 팀은 참석·불참을 센 적이 없다. 센 건 "답을 했나 안 했나"뿐이다.
-- 그 자료를 옮기면 "투표는 했는데 참석인지 불참인지 모른다"는 상태가 생긴다.
-- 참석으로 바꿔 넣으면 안 된다 — 다음 주 라인업이 그 거짓말 위에서 짜인다.
--
-- 그리고 명단에 20대가 둘 있다. 연령대를 30~60대로만 만들어 둬서 담기지 않았다.

-- alter type ... add value 는 같은 트랜잭션 안에서 그 값을 쓸 수 없다.
-- 그래서 이 파일은 값만 더하고, 쓰는 쪽(앱·이관 SQL)은 따로 둔다.
alter type public.attendance_status add value if not exists 'voted';
alter type public.age_band add value if not exists '20';

comment on type public.attendance_status is
  'voted 는 "투표는 했는데 참석·불참을 우리가 모른다". 옛 엑셀을 옮길 때 생긴다. '
  '참석으로 승격시키지 않는다.';
