/**
 * EXPO_PUBLIC_ 접두사가 붙은 값만 번들에 들어간다.
 * Anthropic 키는 여기 두면 안 된다 — Edge Function 시크릿으로만 관리한다.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** 둘 다 있어야 원격 모드. 하나라도 없으면 기기 저장소만 쓰는 데모 모드로 뜬다. */
export const isRemoteConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
