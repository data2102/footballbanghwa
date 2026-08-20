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
npm run db:test    # 로컬 Supabase 에 RLS 테스트 (npx supabase start 필요)
npm start          # Expo 개발 서버, QR 찍어 Expo Go 로 실기기 확인
npm run start:tunnel  # 폰과 맥이 다른 네트워크일 때
npm run typecheck  # tsc --noEmit
npm run build:web  # 정적 웹 번들 (dist/)
npm run db:push    # supabase db push
npm run fn:deploy  # Edge Function 3개 배포
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

**라이트로 고정했다.** 쓰는 자리가 일요일 아침 운동장이라, 직사광선 아래에서 어두운 화면은
잘 안 보인다. `usePalette()` 는 시스템 설정을 보지 않는다. 다크 팔레트(`dark`)는 남겨 뒀으니
나중에 설정에 스위치를 붙이면 여기서 고르기만 하면 된다 — `useColorScheme()` 분기를
화면 코드에 새로 만들지 않는다.

### AI 계약은 파일 두 개가 짝이다

`src/lib/ai/contract.ts`(앱 타입)와 `supabase/functions/_shared/schema.ts`(Claude JSON Schema)는
같은 모양을 유지해야 한다. **한쪽만 고치면 조용히 어긋난다** — 타입 검사도 못 잡는다.

항목을 추가할 때:
1. `contract.ts` 에 타입 추가
2. `schema.ts` 의 `kind` enum + 필요한 프로퍼티 추가 (전부 `required` + nullable 로 둔다)
3. `_shared/prompt.ts` 에 그 종류를 어떻게 읽을지 규칙 추가
4. `parse-text/index.ts` 의 `normalizeItem` 에 분기 추가
5. `src/app/quick-input.tsx` 의 `describe()` 와 `commit()` 에 분기 추가
6. `src/lib/ai/demoParser.ts` 에도 대략의 규칙 추가 (없으면 데모 모드에서 그 종류가 안 읽힌다)

### 출석과 출전은 다른 값이다

`Attendance` 는 왔는지, 출전은 몇 쿼터 뛰었는지다. 둘을 하나로 합치면
"왔는데 한 쿼터도 못 뛴 사람"이 사라지는데, 그 사람이 라인업 공정성의 핵심이다.
`fairnessOrder()` 가 이 값으로 배정 순서를 정한다.

### 출전은 라인업에서 센다. 따로 적지 않는다

`Lineup` 은 (경기, 쿼터, 팀) 하나에 하나다. 이 팀은 자체경기라 화이트보드 한 장에
두 팀이 그려지고 쿼터마다 다시 그린다. 누가 어느 자리에 섰는지가 거기 다 들어 있어서,
출전 쿼터를 따로 적는 테이블은 두지 않는다 — 같은 사실을 두 곳에 적으면 반드시 어긋난다.

`quarterPlay()` · `quartersForMatch()` · `playingTime()` 이 전부 `data.lineups` 를 읽는다.
출전 수를 어딘가에 저장하고 싶어지면 먼저 이걸 의심한다.

### 회비는 금액이 아니라 "그 달이 채워졌나"로 본다

연납(`Ledger.months = 12`)은 할인이라, 금액을 12로 나눠 매달에 붙이면 매달 조금씩
모자란 것처럼 보여서 연납한 사람이 열두 달 내내 독촉 명단에 남는다. `duesForPeriod()` 는
그 달을 덮는 줄이 있으면 금액과 무관하게 완납으로 친다.

### 링크로 열리는 화면은 로그인 문 밖에 있다

`/vote` 는 `_layout.tsx` 의 게이트를 지나지 않고, 저장소 인터페이스도 거치지 않는다
(`src/lib/vote.ts`). Repo 는 "로그인한 팀원"을 전제하는데 링크를 누르는 사람은 그게 아니다.

**anon 이 부를 수 있는 함수는 `ballot_by_share_token` 과 `vote_by_share_token` 둘뿐이다.**
여기에 하나를 더할 생각이면 먼저 이걸 물어본다 — 토큰만 아는 사람에게 보여도 되는가.
`supabase/tests/rls_test.sql` 의 10·11번이 "링크로는 어떤 테이블도 안 읽힌다"를 지킨다.

토큰은 경로가 아니라 쿼리(`/vote?t=...`)로 붙인다. 정적 호스팅에는 `/vote/<토큰>` 파일이
없어서 404 대체 페이지가 뜨고, 그러면 서버 HTML 과 화면이 어긋나 하이드레이션이 깨진다.

### MVP 는 누가 찍었는지 저장하지 않는다

`PotmVote.ballot` 은 기기마다 만든 무작위 값이라 사람을 되짚을 수 없다. 한 기기가 두 번
넣는 것만 막는다. 동호회에서 "누가 나를 안 찍었나"가 드러나면 그 주 분위기가 달라진다.
FootballLab 식 실명 점수(1~9점)를 넣지 않은 것도 같은 이유다.

### 앱 밖으로 내보내는 건 src/lib/share.ts 를 거친다

라인업이든 공지든 실제로 도는 곳은 단톡방이다. 플랫폼마다 되는 게 달라서
공유 시트 → 클립보드 순으로 내려가고, 마지막에는 반드시 복사가 된다.
"아무 일도 안 일어남"이 없어야 한다.

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

### 함수 권한은 PUBLIC 부터 걷어낸다

Postgres 는 새 함수의 EXECUTE 를 **PUBLIC 에 기본으로 준다.** `revoke ... from anon` 만
해서는 아무것도 막히지 않는다. security definer 함수를 만들면 반드시:

```sql
revoke all on function public.어떤함수(인자) from public, anon, authenticated;
grant execute on function public.어떤함수(인자) to service_role;
```

이걸 빠뜨려서 모든 팀의 기기 토큰이 열린 적이 있다. `supabase/tests/rls_test.sql` 에
"앱에서는 못 부른다" 케이스를 넣어 두면 다음에 잡힌다.

## 자주 걸리는 것

- **Node 20.12 이상이어야 한다.** 그 아래에서는 `.env` 가 생기는 순간
  `util.parseEnv is not a function` 으로 터진다. `.env` 가 없을 때는 멀쩡히 돌아서
  원인이 안 보인다. package.json 의 engines 로 막아 뒀다.
- **`EXPO_PUBLIC_` 접두사가 붙은 값만 앱 번들에 들어간다.** Anthropic 키는 절대 `.env` 에 넣지
  않는다. Edge Function 시크릿으로만 관리한다.
- **데모 모드를 깨뜨리지 않는다.** `.env` 없이 `npm run web` 이 그대로 떠야 한다.
  새 기능이 Supabase 를 요구하면 로컬 대체 경로를 같이 만든다.
- **한글 폰트는 웹에서만 불러온다**(`src/app/+html.tsx`). Noto Sans KR 한 벌이 수 MB 라
  네이티브 번들에 넣으면 모바일 웹이 느려진다. 네이티브는 시스템 한글 폰트를 쓴다.
- **`app.json` 을 직접 고치되 `app.config.js` 는 건드리지 않는다.** 후자는 데모 빌드에서
  웹 출력 방식만 바꾸는 얇은 껍데기다.
- **새 레코드의 id 는 UUID 여야 한다.** 테이블의 id 컬럼이 전부 `uuid` 라서 아무 문자열이나
  넣으면 insert 가 막힌다. `uid()`(`src/lib/format.ts`)를 쓰고 직접 만들지 않는다.
- 시드 데이터(`src/lib/seed.ts`)는 결정적이어야 한다. `Math.random()` 을 쓰면 앱을 열 때마다
  출석률이 달라져서 화면 확인이 안 된다.
- **시드를 고쳤으면 `SEED_VERSION` 을 올린다.** `LocalRepo` 는 기기에 저장된 게 있으면
  시드를 다시 읽지 않는다. 안 올리면 배포해도 예전 데모 데이터가 그대로 보인다 —
  한 번 이걸로 "회원 정보가 업데이트 안 됐다"는 말을 들었다.

## 검증

UI 를 고쳤으면 화면을 실제로 띄워서 확인한다. 타입 검사만으로는 레이아웃이 깨진 걸 못 잡는다.

**네이티브에서만 드러나는 것들이 있다.** 웹에서 멀쩡해도 폰에서는 다르게 보인다 —
안전영역(노치·홈 인디케이터), 키보드가 올라올 때의 레이아웃, 탭바 높이, 폰트 두께,
그림자, 스크롤 관성. 화면을 손봤으면 `npm start` 로 폰에서도 한 번 본다.

```bash
npm run build:web
npx serve dist -l 4173   # 브라우저에서 확인
```
