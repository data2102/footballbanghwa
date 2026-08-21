-- 카톡에서 쓰는 이름을 회원에 붙여 둔다.
--
-- 투표 화면을 사진으로 읽을 때, 카톡 별명("화이팅", "Bong", "IMX LOGIS")은 실제 이름과
-- 글자가 하나도 안 겹쳐서 프롬프트를 아무리 고쳐도 못 맞힌다. AI 를 더 똑똑하게 만들 게
-- 아니라 답을 기억시켜야 한다 — 한 번 "이 사람이에요"를 고르면 그 이름을 여기 담고,
-- 다음 주부터는 명단과 같이 보내서 저절로 맞게 한다.
--
-- nickname 은 한 칸짜리라 "철수형" 하나밖에 못 담는다. 그건 그대로 두고 따로 둔다.
alter table public.members
  add column if not exists aliases text[] not null default '{}';

comment on column public.members.aliases is
  '카톡 등에서 이 사람을 가리키는 다른 이름들. 사진 분석이 명단과 대조할 때 같이 본다.';
