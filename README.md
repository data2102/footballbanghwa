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

## 2. 맥북에서 시작하기

필요한 것은 **Node 20 이상**(22 권장)과 npm 뿐이다. 나머지는 나중에 필요할 때 깔면 된다.

```bash
git clone https://github.com/data2102/footballbanghwa.git
cd footballbanghwa
git checkout claude/early-soccer-team-app-2uexcc
npm install
npm run web
```

브라우저가 `http://localhost:8081` 을 열고 **방화 FC** 데모 팀이 뜨면 성공이다.
확인할 것 세 가지:

1. 상단에 노란 "데모 모드로 실행 중" 배너 — Supabase 없이 도는 상태라는 뜻이다
2. 아래 탭 6개(오늘·참석·라인업·회비·회원·기록)가 모두 열린다
3. 오른쪽 아래 **문자·사진 입력** → 참석 → "예시 문구 넣어보기" → "붙여넣은 내용 분석하기"
   → 체크 목록이 나오고 저장하면 참석 탭에 반영된다

여기까지 되면 앱 자체는 정상이다. 이 시점의 저장은 브라우저에만 남는다.

### 실기기에서 보기

```bash
npm start   # QR 코드가 뜬다
```

폰에 [Expo Go](https://expo.dev/go)를 깔고 QR 을 찍으면 된다. 카메라·사진첩도 Expo Go 안에서
동작하므로 사진 입력까지 실기기로 확인할 수 있다. 시뮬레이터를 쓰려면 iOS 는 Xcode,
안드로이드는 Android Studio 가 필요하다.

### 브랜치 정리 (선택)

지금 저장소에는 `claude/early-soccer-team-app-2uexcc` 브랜치 하나만 있다.
`main` 으로 쓰고 싶으면:

```bash
git branch -m claude/early-soccer-team-app-2uexcc main
git push -u origin main
# GitHub 저장소 Settings > Branches 에서 기본 브랜치를 main 으로 바꾼다
```

---

## 3. Supabase 붙이기

여기까지 하면 팀원끼리 데이터를 공유하고, 문자·사진을 Claude 가 읽는다. 30분쯤 걸린다.

### 3-0. 계정과 키 준비

1. [supabase.com](https://supabase.com) 에서 프로젝트를 하나 만든다 (무료 티어로 충분하다).
   리전은 `Northeast Asia (Seoul)` 이 빠르다.
2. 프로젝트 **Settings > General** 에서 `Reference ID` 를 복사한다 → 아래 `<프로젝트 ref>`
3. **Settings > API** 에서 `Project URL` 과 `anon public` 키를 복사한다 → 3-3 에서 쓴다
4. [console.anthropic.com](https://console.anthropic.com) 에서 API 키를 발급한다 → 3-2 에서 쓴다

### 3-1. 스키마 반영

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

### 3-4. 붙었는지 확인하기

1. `npm run web` → 노란 데모 배너가 **사라지고** 로그인 화면이 뜬다
2. 이메일 입력 → 받은 6자리 코드로 로그인
3. "새 팀 만들기" → 팀 이름·월 회비·내 이름 입력
4. 설정 탭에서 회원 몇 명 추가
5. **문자·사진 입력**에 실제 단톡방 내용을 붙여넣어 본다. 요약 문구가
   "규칙 파서로 N건 읽었어요" 가 아니면 Claude 가 붙은 것이다
6. 손으로 쓴 명단을 찍어서도 넣어 본다 — 이게 되면 전체 파이프라인이 살아 있는 것이다

초대코드는 설정 탭에 6자리로 표시된다. 팀원은 그 코드로 참여한다.

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
npm run build:demo  # 공유용 단일 파일 (dist-demo/demo.html)
```

**커밋 전에 두 가지를 통과시킨다.** 타입만 맞고 번들이 깨지는 경우가 실제로 있었다.

```bash
npm run typecheck && npm run build:web
```

웹 배포는 `npm run build:web` 결과인 `dist/`를 Vercel·Netlify·Cloudflare Pages 어디에
올려도 된다. `npm run build:demo` 는 자바스크립트까지 안에 품은 HTML 한 장을 만든다 —
팀원에게 링크 하나로 보여줄 때 쓴다.

### 스토어에 올릴 때

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios       # 또는 android
```

`app.json` 에 번들 ID(`com.footballbanghwa.app`)와 카메라·사진첩 권한 문구가 이미 들어 있다.
Expo Go 로는 확인되지만 스토어 빌드는 아직 안 돌려봤다.

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

화면 목업: `design/mockup.html` (브라우저로 바로 열면 된다). 화면 10종과 원칙별 적용 근거,
코드에 반영한 항목이 정리돼 있다.

### 작업 규칙

새로 코드를 고칠 때 지킬 규칙은 [`CLAUDE.md`](CLAUDE.md) 에 있다. 저장소 추상화, 토큰 이름이
두 벌인 이유, AI 계약 파일 두 개를 같이 고쳐야 하는 것, 마이크로카피 규칙 등.
Claude Code 를 쓰면 자동으로 읽는다.

---

## 7. 아직 확인 못 한 것

정직하게 적어둔다. 아래는 코드는 다 있지만 **실제로 돌려본 적이 없다**.

| 항목 | 왜 |
|---|---|
| 사진 파싱 (손글씨 명단·작전판·은행 캡처) | Claude 를 붙여야 확인된다. 데모 모드에는 없다 |
| Supabase 원격 모드 전체 | 이 저장소를 만든 환경에 Supabase 프로젝트가 없었다 |
| iOS/Android 네이티브 빌드 | Expo Go 로는 확인 가능하지만 스토어 빌드는 안 돌려봤다 |
| 프로필 사진 업로드 | 스토리지 버킷이 있어야 한다 |

확인된 것: 타입 검사, 웹 번들, 전 화면 렌더링, 문자 입력 → 분석 → 저장 → 반영 흐름
(규칙 파서 기준), 6개 탭 이동, 회원 상세 진입.

## 8. 막혔을 때

**`npm install` 이 느리거나 실패한다**
`node -v` 로 20 이상인지 본다. `rm -rf node_modules package-lock.json && npm install` 로 다시.

**웹은 되는데 Expo Go 에서 하얀 화면**
폰과 맥이 같은 와이파이에 있어야 한다. 안 되면 `npx expo start --tunnel`.

**로그인 메일이 안 온다**
Supabase **Authentication > Providers > Email** 에서 Email 이 켜져 있는지, 스팸함도 본다.
무료 티어는 시간당 발송 수 제한이 있다.

**로그인은 됐는데 "팀 정보를 먼저 불러와야 합니다"**
`supabase db push` 가 안 돌았거나 실패한 경우다. `supabase db push --dry-run` 으로 확인한다.

**AI 분석이 "분석하지 못했어요" 로 끝난다**
`supabase functions logs parse-text` 를 본다. 대부분 `ANTHROPIC_API_KEY` 시크릿 누락이다.

**사진을 올리면 용량 오류**
`src/lib/photo.ts` 의 `MAX_EDGE`(1568)를 줄인다. Claude 가 보는 해상도라 더 줄여도 대개 읽는다.

**색을 바꾸고 싶다**
`src/theme.ts` 만 고치면 앱 전체에 반영된다. 화면 코드에는 HEX 가 없다.

## 9. 다음에 붙일 만한 것

- 경기 전날 미응답자에게 푸시 알림 (`expo-notifications` + Supabase 스케줄러)
- 회비 미납자 자동 리마인드 문구 생성
- 음성 입력 — 운동장에서 말로 기록. 받아쓴 뒤 같은 파이프라인 재사용
- 카톡 공유시트 연동 — 대화를 길게 눌러 앱으로 바로 보내기 (네이티브 빌드 필요)
- 팀 여러 개 전환 (스키마와 RPC는 이미 다중 팀을 지원한다)
