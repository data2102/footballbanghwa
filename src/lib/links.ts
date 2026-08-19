import { Platform } from 'react-native';
import * as Linking from 'expo-linking';

/**
 * 앱 밖으로 내보낼 주소를 만든다.
 *
 * 참석 링크는 앱을 안 깐 사람이 눌러야 하므로 웹 주소여야 한다. 네이티브에서는
 * 지금 앱이 어느 주소로 배포됐는지 알 수 없어서, 빌드할 때 알려 준 값을 쓴다.
 * 그 값도 없으면 딥링크로 떨어진다 — 같은 앱을 깐 사람끼리는 그래도 열린다.
 */
const PUBLIC_WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? '';

function webOrigin(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    return `${window.location.origin}${base}`;
  }
  return PUBLIC_WEB_URL ? PUBLIC_WEB_URL.replace(/\/$/, '') : null;
}

/**
 * 가입 없이 참석만 남기는 주소.
 *
 * 토큰을 경로가 아니라 쿼리(?t=)로 붙인다. 정적 호스팅에는 /vote/<토큰> 파일이 없어서
 * 404 대체 페이지가 뜨고, 그러면 서버 HTML 과 화면이 어긋나 React 가 하이드레이션을 버린다.
 */
export function voteUrl(token: string): string {
  const origin = webOrigin();
  return origin ? `${origin}/vote?t=${token}` : Linking.createURL('/vote', { queryParams: { t: token } });
}

/**
 * 로그인 메일의 링크가 되돌아올 주소.
 *
 * 이 값을 안 넘기면 Supabase 가 Site URL(기본값 localhost:3000)로 보낸다.
 * 그러면 메일의 링크를 눌러도 아무 데도 도착하지 않는다 — 실제로 그렇게 막혔었다.
 * 이 주소는 Supabase 의 Authentication > URL Configuration 의 Redirect URLs 에도 있어야 한다.
 */
export function authRedirectUrl(): string {
  const origin = webOrigin();
  return origin ? `${origin}/` : Linking.createURL('/');
}

/** 이 링크를 눌러도 웹으로 안 열리는 상황인지. 화면에서 안내 문구를 가를 때 쓴다. */
export const hasWebOrigin = Platform.OS === 'web' || Boolean(PUBLIC_WEB_URL);
