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
| 이메일 OTP 로그인 / 팀 생성·초대코드 참여 | 완료 |
| Supabase 스키마 + RLS | 완료 (`supabase/migrations`) |
| Claude 파서 Edge Function | 완료 (`supabase/functions/parse-text`) |
| 푸시 알림, 사진 업로드, 다중 팀 전환 | 미구현 |

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
    (tabs)/stats.tsx      기록·랭킹
    quick-input.tsx       ★ 문자 붙여넣기 → AI 분석 → 체크 후 저장
    settings.tsx          팀·명단·경기 관리
  lib/
    ai/contract.ts        앱 ↔ Edge Function 계약 (스키마와 짝을 이룸)
    ai/client.ts          parse-text 호출 / 데모 모드 분기
    ai/demoParser.ts      키 없이 쓰는 규칙 파서
    repo/                 저장소 추상화 (local | supabase)
    store.ts              zustand 상태 + 낙관적 갱신
    selectors.ts          집계 (미납자, 랭킹, 참석 통계)
    types.ts              도메인 모델
  features/
    lineup/formations.ts  포메이션 카탈로그 (11인/9인/8인)
    lineup/Pitch.tsx      필드 렌더링
    auth/                 로그인·팀 연결
supabase/
  migrations/             스키마 + RLS
  functions/parse-text/   Claude 프록시
  functions/_shared/      프롬프트 · JSON Schema · CORS
```

### AI 파싱이 도는 방식

1. 앱이 원문 + **팀 명단(id·이름·별명·등번호)** + 오늘 날짜를 Edge Function에 보낸다.
2. Edge Function이 Claude를 호출한다. 시스템 프롬프트에 조기축구 은어 사전이 들어 있다
   (`ㅇ/ㄴ`, `늦참`, `n빵`, `골키/수미/윙`, 은행 문자에서 잔액과 입금액 구분 등).
   출력은 `output_config.format`의 JSON Schema로 강제된다.
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

## 6. 다음에 붙일 만한 것

- 경기 전날 미응답자에게 푸시 알림 (`expo-notifications` + Supabase 스케줄러)
- 카톡 공유시트 연동 — 대화를 길게 눌러 앱으로 바로 보내기 (네이티브 빌드 필요)
- 음성 입력 — 운동장에서 말로 기록. STT 후 같은 파이프라인 재사용
- 회비 미납자 자동 리마인드 문구 생성
- 팀 여러 개 전환 (스키마와 RPC는 이미 다중 팀을 지원한다)
