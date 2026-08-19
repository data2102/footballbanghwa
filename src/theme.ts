import { useColorScheme } from 'react-native';

/** 운동장에서 햇빛 아래 보는 화면이라 대비를 세게 잡았다. */
const light = {
  bg: '#F4F6F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF1EF',
  border: '#DDE3E0',
  text: '#11201A',
  textMuted: '#66756E',
  primary: '#0B6E4F',
  primarySoft: '#DCEFE6',
  onPrimary: '#FFFFFF',
  danger: '#C2410C',
  dangerSoft: '#FDE8DC',
  warn: '#B45309',
  warnSoft: '#FDF0D5',
  ok: '#15803D',
  okSoft: '#DCF0E1',
};

const dark: typeof light = {
  bg: '#0E1412',
  surface: '#18211D',
  surfaceAlt: '#212C27',
  border: '#2C3833',
  text: '#ECF2EF',
  textMuted: '#93A29B',
  primary: '#3DBB8A',
  primarySoft: '#16352A',
  onPrimary: '#06231A',
  danger: '#F97316',
  dangerSoft: '#3A2011',
  warn: '#FBBF24',
  warnSoft: '#382B10',
  ok: '#4ADE80',
  okSoft: '#123020',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** 본문은 한 손으로 읽는 걸 전제로 조금 크게. */
export const font = {
  h1: { fontSize: 24, fontWeight: '700' as const },
  h2: { fontSize: 18, fontWeight: '700' as const },
  h3: { fontSize: 15, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const },
};

/** 모바일 웹에서 데스크톱으로 열었을 때 콘텐츠가 가로로 늘어지지 않게 잡는 폭. */
export const CONTENT_MAX_WIDTH = 560;
