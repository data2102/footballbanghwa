import { Platform } from 'react-native';

/**
 * 여백(Yeobaek) 디자인 시스템 토큰.
 * 값의 출처는 github.com/data2102/design-system 의 tokens.css v1.4 이고,
 * 여기서 색을 새로 만들지 않는다. 화면 코드는 반드시 이 파일을 거쳐서 색을 쓴다.
 *
 * 이름이 두 벌인 토큰(primary / primaryStrong 등)은 접근성 때문이다.
 * - 뒤에 오는 -Line 계열: 테두리·아이콘 같은 비텍스트 UI 용
 * - 뒤에 오는 -Strong 계열: 글자를 얹는 곳(채운 버튼 배경, 연한 틴트 위 글자) 용
 */
const light = {
  bg: '#F2F4F6',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border: '#EEF1F4',
  borderStrong: '#D1D6DB',

  text: '#191F28',
  textMuted: '#4E5968',
  textFaint: '#8B95A1',
  textDisabled: '#B0B8C1',

  primary: '#3182F6',
  primaryStrong: '#1D63C9',
  primarySoft: '#E8F3FF',
  onPrimary: '#FFFFFF',

  ok: '#0A7350',
  okLine: '#12B886',
  okSoft: '#E6FCF5',
  warn: '#7A5300',
  warnLine: '#F59F00',
  warnSoft: '#FFF9DB',
  danger: '#C0261E',
  dangerLine: '#F03E3E',
  dangerSoft: '#FFF0F0',
};

export const dark: typeof light = {
  bg: '#0F1117',
  surface: '#181B24',
  surfaceAlt: '#12141B',
  border: '#1E2129',
  borderStrong: '#262A35',

  text: '#E6E8EE',
  textMuted: '#C5C9D3',
  textFaint: '#8A90A2',
  textDisabled: '#565B68',

  primary: '#22D3EE',
  primaryStrong: '#22D3EE',
  primarySoft: '#10313A',
  onPrimary: '#06232A',

  ok: '#34D399',
  okLine: '#34D399',
  okSoft: '#0F2E26',
  warn: '#FBBF24',
  warnLine: '#FBBF24',
  warnSoft: '#2E2408',
  danger: '#F87171',
  dangerLine: '#F87171',
  dangerSoft: '#2E1414',
};

export type Palette = typeof light;

/**
 * 라이트로 고정한다.
 *
 * 일요일 아침 운동장은 밝다. 폰이 다크 모드면 앱도 어둡게 떴는데, 직사광선 아래
 * 어두운 화면은 잘 안 보인다. 쓰는 자리가 야외라서 시스템 설정을 따라가지 않는다.
 *
 * 다크 팔레트(dark)는 지우지 않고 남겨 뒀다. 나중에 설정에 스위치를 붙이면
 * 여기서 고르기만 하면 된다.
 */
export function usePalette(): Palette {
  return light;
}

/** 인풋·태그 8 / 버튼 12 / 카드 16 / 큰 카드 20. 한 화면에서 섞지 않는다. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

/** 4의 배수만. 13px·17px 같은 어중간한 값은 쓰지 않는다. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

/**
 * 웹에서는 Noto Sans KR 을 CSS 로 불러온다(+html.tsx).
 * 네이티브는 안드로이드 기본 폰트가 이미 Noto Sans CJK KR 이고 iOS 는 Apple SD Gothic Neo 라,
 * 수 MB짜리 한글 TTF를 번들에 넣는 대신 시스템 폰트를 그대로 쓴다.
 */
const sans = Platform.select({ web: '"Noto Sans KR", "Pretendard", sans-serif', default: undefined });
const mono = Platform.select({
  web: '"JetBrains Mono", "D2Coding", Consolas, monospace',
  ios: 'Menlo',
  default: 'monospace',
});

/** display 30 / title 22 / heading 18 / subhead 16 / body 15 / caption 13 / footnote 12 */
export const font = {
  /** 화면당 하나. 주인공 숫자. */
  display: { fontSize: 30, fontWeight: '500' as const, letterSpacing: -0.4, fontFamily: sans },
  title: { fontSize: 22, fontWeight: '500' as const, letterSpacing: -0.4, fontFamily: sans },
  h1: { fontSize: 22, fontWeight: '500' as const, letterSpacing: -0.4, fontFamily: sans },
  h2: { fontSize: 18, fontWeight: '500' as const, fontFamily: sans },
  h3: { fontSize: 15, fontWeight: '500' as const, fontFamily: sans },
  body: { fontSize: 15, fontWeight: '400' as const, fontFamily: sans },
  small: { fontSize: 13, fontWeight: '400' as const, fontFamily: sans },
  tiny: { fontSize: 12, fontWeight: '400' as const, fontFamily: sans },
};

/** 숫자가 세로로 줄 맞아야 하는 곳(장부·랭킹·회비)에 얹는다. */
export const numeric = { fontFamily: mono, fontVariant: ['tabular-nums' as const] };

/** 모바일 웹에서 데스크톱으로 열었을 때 콘텐츠가 가로로 늘어지지 않게 잡는 폭. */
export const CONTENT_MAX_WIDTH = 560;
