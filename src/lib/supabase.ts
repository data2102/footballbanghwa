import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRemoteConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * Expo Router 는 웹 화면을 Node 에서 한 번 미리 렌더링한다(개발 서버·정적 빌드 둘 다).
 * 그 단계에는 window 가 없는데, AsyncStorage 의 웹 구현은 window.localStorage 를 쓴다.
 * Supabase 클라이언트는 만들어지자마자 저장된 세션을 읽으므로, 그대로 두면
 * "ReferenceError: window is not defined" 로 서버가 뜨지도 않는다.
 *
 * React Native 에서는 window 가 정의돼 있으므로, 이 검사는 정확히 "노드에서 렌더링 중"만 잡는다.
 */
const isServerRender = typeof window === 'undefined';

/** 미리 렌더링하는 동안만 쓰는 임시 저장소. 그때는 로그인 상태가 없는 게 맞다. */
const memoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
  };
})();

/**
 * 환경변수가 없으면 null. 호출부는 반드시 null 체크를 하고,
 * null이면 기기 저장소 기반 데모 모드로 동작한다.
 */
export const supabase: SupabaseClient | null = isRemoteConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: isServerRender ? memoryStorage : AsyncStorage,
        // 미리 렌더링 단계에서는 토큰을 새로 받아 올 이유가 없다.
        autoRefreshToken: !isServerRender,
        persistSession: !isServerRender,
        // RN에는 URL 콜백이 없다. 웹에서도 6자리 코드로 로그인하므로 켤 필요가 없다.
        detectSessionInUrl: false,
      },
    })
  : null;
