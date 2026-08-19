# CLAUDE.md

이 저장소에서 작업할 때 참고할 규칙. 코드를 고치기 전에 한 번 읽고 시작한다.

## 이 앱이 뭔가

조기축구 감독·코치·총무를 위한 팀 운영 앱. **핵심 전제는 "운동장에서 타이핑하지 않는다"** 이다.
단톡방 대화, 은행 입금 문자, 손으로 쓴 명단 사진을 그대로 넣으면 AI가 구조화하고,
사람은 체크박스로 확인만 한다.

기능을 추가할 때 이 전제를 먼저 확인한다 — 새 화면에 입력 폼만 있고 문자·사진 경로가
없다면 설계가 이 앱의 성격과 어긋난 것이다.

## 명령어

```bash
npm run web        # 모바일 웹 개발 서버 (가장 자주 쓴다)
npm start          # Expo 개발 서버, QR 찍어 Expo Go 로 실기기 확인
npm run typecheck  # tsc --noEmit
npm run build:web  # 정적 웹 번들 (dist/)
npm run db:push    # supabase db push
npm run fn:deploy  # parse-text Edge Function 배포
```

**커밋 전에 반드시 두 가지를 통과시킨다.** 타입만 맞고 번들이 깨지는 경우가 실제로 있다.

```bash
npm run typecheck && npm run build:web
```

## 아키텍처에서 지켜야 할 것

### 저장소는 인터페이스 뒤에 있다

화면과 스토어는 `src/lib/repo/types.ts` 의 `Repo` 인터페이스만 안다.
`LocalRepo`(기기 저장소)와 `SupabaseRepo` 두 구현이 있고, 환경변수 유무로 `repo/index.ts` 가 고른다.

- 화면에서 `supabase` 를 직접 import 하지 않는다. 저장이 필요하면 스토어 액션을 통한다.
- `Repo` 에 메서드를 더하면 **두 구현 모두** 채워야 한다. 로컬 쪽을 빼먹으면 데모 모드가 깨진다.

### 색은 theme.ts 밖에서 만들지 않는다

`src/theme.ts` 가 [여백 디자인 시스템](https://github.com/data2102/design-system) 토큰을 들고 있다.
화면 코드에 HEX 리터럴을 쓰지 않는다. 토큰 이름이 두 벌인 이유는 접근성이다:

- `primary` / `okLine` / `warnLine` / `dangerLine` — 테두리·아이콘 같은 **비텍스트 UI**
- `primaryStrong` / `ok` / `warn` / `danger` — **글자를 얹는 곳**(채운 버튼 배경, 연한 틴트 위 글자)

간격은 4의 배수만(`space`), 둥글기는 인풋 8 / 버튼 12 / 카드 16(`radius`).

### AI 계약은 파일 두 개가 짝이다

`src/lib/ai/contract.ts`(앱 타입)와 `supabase/functions/_shared/schema.ts`(Claude JSON Schema)는
같은 모양을 유지해야 한다. **한쪽만 고치면 조용히 어긋난다** — 타입 검사도 못 잡는다.

항목을 추가할 때:
1. `contract.ts` 에 타입 추가
2. `schema.ts` 의 `kind` enum + 필요한 프로퍼티 추가 (전부 `required` + nullable 로 둔다)
3. `_shared/prompt.ts` 에 그 종류를 어떻게 읽을지 규칙 추가
4. `parse-text/index.ts` 의 `normalizeItem` 에 분기 추가
5. `src/app/quick-input.tsx` 의 `describe()` 와 `commit()` 에 분기 추가

### AI 결과는 사람 확인 없이 저장되지 않는다

파싱 결과는 항상 체크박스 검토 화면을 거친다. `commit()` 만이 스토어를 건드린다.
"자동으로 반영" 같은 경로를 새로 만들지 않는다 — 총무가 잘못 들어간 회비를 되돌리는 비용이
파싱 실패보다 훨씬 크다.

### 프로필 사진은 경로와 표시 주소가 다르다

`Member.photoPath` 가 DB 에 저장되는 스토리지 경로이고, `Member.photoUri` 는 화면에 그릴
주소다. Supabase 모드에서는 비공개 버킷이라 로드할 때마다 서명 URL 을 새로 만든다.
`photoUri` 를 DB 에 쓰면 안 된다.

## 글쓰기 규칙

여백 디자인 시스템의 마이크로카피 규칙을 따른다.

- **"~했어요" 체.** "저장했어요" (O) / "성공적으로 저장되었습니다!" (X)
- 버튼은 동사로 시작. "라인업 저장하기" (O) / "저장" (X)
- 오류는 무슨 일 + 어떻게. raw 에러 문자열을 그대로 노출하지 않는다.
- 빈 화면은 사과 말고 초대. "첫 경기를 만들어 보세요"
- **이모지를 UI 에 쓰지 않는다.** 아이콘은 `src/components/icons.tsx` 의 아웃라인 세트만 쓴다.
- 화면당 채운 파란 버튼은 하나. 나머지는 `tone="neutral"`.
- 화면당 큰 숫자(`Hero`)는 하나. 그 화면에서 제일 알고 싶은 것 하나만 키운다.

## 자주 걸리는 것

- **`EXPO_PUBLIC_` 접두사가 붙은 값만 앱 번들에 들어간다.** Anthropic 키는 절대 `.env` 에 넣지
  않는다. Edge Function 시크릿으로만 관리한다.
- **데모 모드를 깨뜨리지 않는다.** `.env` 없이 `npm run web` 이 그대로 떠야 한다.
  새 기능이 Supabase 를 요구하면 로컬 대체 경로를 같이 만든다.
- **한글 폰트는 웹에서만 불러온다**(`src/app/+html.tsx`). Noto Sans KR 한 벌이 수 MB 라
  네이티브 번들에 넣으면 모바일 웹이 느려진다. 네이티브는 시스템 한글 폰트를 쓴다.
- **`app.json` 을 직접 고치되 `app.config.js` 는 건드리지 않는다.** 후자는 데모 빌드에서
  웹 출력 방식만 바꾸는 얇은 껍데기다.
- 시드 데이터(`src/lib/seed.ts`)는 결정적이어야 한다. `Math.random()` 을 쓰면 앱을 열 때마다
  출석률이 달라져서 화면 확인이 안 된다.

## 검증

UI 를 고쳤으면 화면을 실제로 띄워서 확인한다. 타입 검사만으로는 레이아웃이 깨진 걸 못 잡는다.

```bash
npm run build:web
npx serve dist -l 4173   # 브라우저에서 확인
```
