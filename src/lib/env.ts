/**
 * EXPO_PUBLIC_ 접두사가 붙은 값만 번들에 들어간다.
 * Anthropic 키는 여기 두면 안 된다 — Edge Function 시크릿으로만 관리한다.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Supabase 키가 있어도 데모 모드로 돌리고 싶을 때 쓴다. `.env` 에 한 줄 넣으면 된다.
 *
 *   EXPO_PUBLIC_DEMO=1
 *
 * 화면과 기능을 손볼 때는 로그인이 매번 방해가 된다. 키를 지웠다 되살리는 것보다
 * 스위치 하나를 두는 편이 낫다 — 되돌릴 때 무엇을 지웠는지 기억할 필요가 없다.
 */
export const forceDemo = process.env.EXPO_PUBLIC_DEMO === '1';

/** 둘 다 있고 데모 강제가 아니어야 원격 모드. 아니면 기기 저장소만 쓴다. */
export const isRemoteConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) && !forceDemo;
