# 우리팀 매니저 (footballbanghwa)

조기축구 **감독 · 코치 · 총무**를 위한 팀 운영 앱.

운동장에서 한 명씩 타이핑할 수 없다는 전제에서 출발한다. 단톡방 대화든 은행 입금 문자든
**있는 그대로 붙여넣으면 AI가 읽어 구조화된 데이터로 바꿔주고**, 사람은 체크박스로 확인만 하면 된다.

- 모바일 웹 우선. React Native(Expo)로 만들어 같은 코드가 iOS/Android 앱으로 확장된다.
- 백엔드는 Supabase(Postgres + Auth + Edge Functions).
- AI 파싱은 Claude. API 키는 Edge Function 안에만 두고 앱에는 절대 넣지 않는다.

---

## 1. 지금 상태

| 기능 | 상태 |
|---|---|
| 참석/불참/지각 집계 | 화면·저장·AI 파싱 완료 |
| 회비·장부 (미납자 자동 추출) | 화면·저장·AI 파싱 완료 |
| 포메이션/라인업 | 화면·저장·AI 파싱 완료 (탭으로 배치·교체) |
| 경기 기록·개인 스탯 | 화면·저장·AI 파싱 완료 |
| 회원 관리 (장점·포지션·출석률·회비) | 화면·저장·AI 파싱 완료 |
| 사진 입력 (카메라 / 사진첩) | 완료 — 손글씨 명단·작전판·은행 앱 캡처를 Claude 가 읽는다 |
| 프로필 사진 | 완료 — Supabase Storage(비공개 버킷 + 서명 URL) |
| 이메일 OTP 로그인 / 팀 생성·초대코드 참여 | 완료 |
| Supabase 스키마 + RLS | 완료 (`supabase/migrations`) |
| Claude 파서 Edge Function | 완료 (`supabase/functions/parse-text`) |
| 여백 디자인 시스템 적용 | 완료 (`design/mockup.html` 참고) |
| 푸시 알림, 음성 입력, 다중 팀 전환 | 미구현 |

**데모 모드**: `.env`가 없으면 Supabase 없이 뜬다. 예시 팀 데이터가 기기 저장소에 들어가고,
AI 파싱은 간단한 규칙 파서(`src/lib/ai/demoParser.ts`)가 대신한다. 흐름을 보는 용도이며
실제 은어·문맥 해석은 Claude를 붙여야 한다.

---

## 2. 맥북에서 이어서 개발하기

```bash
git clone <이 저장소>
cd footballbanghwa
git checkout claude/early-soccer-team-app-2uexcc
npm install

# 데모 모드로 바로 실행 (설정 0)
npm run web          # http://localhost:8081
npm start            # QR 찍어서 Expo Go 로 실기기 확인
```

필요한 것: Node 20+ (권장 22), npm. iOS 시뮬레이터는 Xcode, Android는 Android Studio.
실기기에서 볼 때는 [Expo Go](https://expo.dev/go) 앱이면 충분하다.

---

## 3. Supabase 붙이기

### 3-1. 프로젝트 생성 & 스키마 반영

```bash
brew install supabase/tap/supabase          # 맥 기준
supabase login
supabase link --project-ref <프로젝트 ref>
supabase db push                            # supabase/migrations 적용
```

`db push`가 만드는 것:

- `teams / members / matches / attendance / ledger / match_events / lineups` 테이블
- 팀 단위 격리 RLS. 팀원만 조회, 감독·코치·총무만 수정, 참석은 본인 것도 수정 가능
- `create_team` / `join_team` / `my_teams` RPC (가입 흐름은 RLS로 표현이 안 되어 SECURITY DEFINER로 처리)

`db push` 는 프로필 사진용 비공개 버킷(`member-photos`)과 그 RLS 정책도 같이 만든다.
경로가 `<team_id>/<member_id>.jpg` 라서 첫 폴더 이름만 보고 같은 팀 사람인지 판별한다.

### 3-2. Claude 파서 배포

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy parse-text
```

기본 모델은 `claude-opus-5`. 바꾸려면 `supabase secrets set ANTHROPIC_MODEL=...`.

### 3-3. 앱 환경변수

```bash
cp .env.example .env
# EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 채우기
npm run web
```

`.env`가 채워지면 앱은 자동으로 원격 모드로 뜬다 — 이메일 OTP 로그인 → 팀 생성 또는
초대코드 참여 → 팀원 전원이 같은 데이터를 본다.

> `EXPO_PUBLIC_` 접두사가 붙은 값만 앱 번들에 들어간다. Anthropic 키는 절대 여기 넣지 말 것.

---

## 4. 구조

```
src/
  app/                    expo-router 화면
    (tabs)/index.tsx      대시보드 — 다음 경기, 미납, 랭킹
    (tabs)/attendance.tsx 참석 집계
    (tabs)/lineup.tsx     포메이션 배치
    (tabs)/finance.tsx    회비·장부
    (tabs)/members.tsx    회원 목록 (출석률·미납·장점)
    (tabs)/stats.tsx      기록·랭킹
    member/[id].tsx       회원 카드 — 장점·출석률·회비·메모·프로필 사진
    quick-input.tsx       ★ 문자·사진 → AI 분석 → 체크 후 저장
    settings.tsx          팀·명단·경기 관리
  lib/
    ai/contract.ts        앱 ↔ Edge Function 계약 (스키마와 짝을 이룸)
    ai/client.ts          parse-text 호출 / 데모 모드 분기
    ai/demoParser.ts      키 없이 쓰는 규칙 파서
    photo.ts              카메라·사진첩 → 1568px 리사이즈 → base64
    repo/                 저장소 추상화 (local | supabase)
    store.ts              zustand 상태 + 낙관적 갱신
    selectors.ts          집계 (미납자, 랭킹, 참석 통계)
    types.ts              도메인 모델
  components/
    icons.tsx             아웃라인 아이콘 한 세트 (이모지 안 씀)
    ui.tsx                Card·Button·Chip·Hero 등 공용 부품
  theme.ts                여백 디자인 시스템 토큰 — 색은 전부 여기서만 나온다
  features/
    lineup/formations.ts  포메이션 카탈로그 (11인/9인/8인)
    lineup/Pitch.tsx      전술판 (잔디 초록 대신 무채색 + 헤어라인)
    auth/                 로그인·팀 연결
supabase/
  migrations/             스키마 + RLS
  functions/parse-text/   Claude 프록시
  functions/_shared/      프롬프트 · JSON Schema · CORS
```

### AI 파싱이 도는 방식

1. 앱이 원문(그리고 사진) + **팀 명단(id·이름·별명·등번호)** + 오늘 날짜를 Edge Function에 보낸다.
   사진은 긴 변 1568px·품질 0.7로 줄여서 base64로 실어 보낸다 — Claude가 그보다 큰 이미지는
   어차피 줄여서 보기 때문에, 미리 줄이면 업로드도 토큰도 아낀다. 최대 4장.
2. Edge Function이 Claude를 호출한다. 시스템 프롬프트에 조기축구 은어 사전이 들어 있다
   (`ㅇ/ㄴ`, `늦참`, `n빵`, `골키/수미/윙`, 은행 문자에서 잔액과 입금액 구분 등).
   사진에 대해서도 규칙이 따로 있다 — 손글씨 출석부의 O/X, 화이트보드 작전판의 세로 위치,
   은행 앱 캡처의 거래 목록, 영수증. 출력은 `output_config.format`의 JSON Schema로 강제된다.
3. 결과는 **사람 단위로 쪼갠 항목 목록**으로 온다. 각 항목에 확신도와 근거가 된 원문 조각이 붙는다.
4. 앱은 이걸 체크박스 목록으로 보여준다. 사람을 특정 못 한 항목은 기본 해제 상태이고
   직접 고를 수 있다. 명단에 없는 이름은 그 자리에서 회원으로 추가할 수 있다.
5. 사용자가 확인한 것만 저장된다. **AI가 바로 DB에 쓰는 경로는 없다.**

프롬프트를 손보려면 `supabase/functions/_shared/prompt.ts`, 스키마를 바꾸려면
`_shared/schema.ts`와 `src/lib/ai/contract.ts`를 **함께** 고쳐야 한다.

---

## 5. 명령어

```bash
npm run web         # 모바일 웹 개발 서버
npm start           # Expo 개발 서버 (실기기/시뮬레이터)
npm run ios         # iOS 시뮬레이터
npm run android     # Android 에뮬레이터
npm run typecheck   # tsc --noEmit
npm run build:web   # 정적 웹 번들 (dist/)
npm run db:push     # supabase db push
npm run fn:deploy   # parse-text 배포
```

웹 배포는 `npm run build:web` 결과인 `dist/`를 Vercel·Netlify·Cloudflare Pages 어디에
올려도 된다.

---

## 6. 디자인

[여백(Yeobaek) 디자인 시스템](https://github.com/data2102/design-system) v1.4를 따른다.
색·간격·둥글기는 전부 `src/theme.ts`의 토큰을 거치고, 화면 코드에 HEX를 직접 쓰지 않는다.

적용하면서 내린 판단 세 가지:

- **초록 브랜드색을 뺐다.** "파랑은 누를 수 있는 것에만"이 원칙이라, 장식으로 깔려 있던 초록을
  지웠다. 파랑은 문자·사진 입력, 저장, 선택 상태에만 나오고 화면당 채운 파란 버튼은 하나다.
- **잔디 초록 필드를 지웠다.** "색은 신호지 장식이 아니다"에 걸린다. 무채색 전술판으로 바꾸니
  필드에 남는 유일한 색이 "지금 고른 자리"가 됐고, 햇빛 아래에서 오히려 더 잘 보인다.
- **한글 폰트는 웹에서만 번들한다.** Noto Sans KR은 한 벌이 수 MB라 네이티브 번들에 넣으면
  모바일 웹이 느려진다. 웹은 `src/app/+html.tsx`에서 Google Fonts로(unicode-range 로 잘라서
  받는다), 네이티브는 시스템 한글 폰트를 쓴다.

화면 목업: `design/mockup.html` (브라우저로 바로 열면 된다)

---

## 7. 다음에 붙일 만한 것

- 경기 전날 미응답자에게 푸시 알림 (`expo-notifications` + Supabase 스케줄러)
- 회비 미납자 자동 리마인드 문구 생성
- 음성 입력 — 운동장에서 말로 기록. 받아쓴 뒤 같은 파이프라인 재사용
- 카톡 공유시트 연동 — 대화를 길게 눌러 앱으로 바로 보내기 (네이티브 빌드 필요)
- 팀 여러 개 전환 (스키마와 RPC는 이미 다중 팀을 지원한다)
