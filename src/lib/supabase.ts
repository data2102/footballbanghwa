import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createClient,
  type SupabaseClient,
  type WebSocketLikeConstructor,
} from '@supabase/supabase-js';
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
 * Realtime 은 이 앱에서 안 쓰는데, 클라이언트를 만들 때 소켓 생성자부터 찾는다.
 * Node 20 에는 전역 WebSocket 이 없어서, 미리 렌더링하는 그 순간
 * "Node.js detected but native WebSocket not found" 로 빌드가 통째로 멈춘다.
 * 실제로 GitHub Pages 빌드가 여기서 죽었다 — 키가 없을 때는 클라이언트를 아예
 * 안 만드니까, 키를 넣은 다음에야 처음 드러났다.
 *
 * 그래서 전역 WebSocket 이 있으면 그걸 주고, 없으면 부르는 순간 터지는 것을 준다.
 * 지금은 아무도 안 부르므로 조용하고, 나중에 Realtime 을 쓰게 되면 그 자리에서 알게 된다.
 */
const socketTransport =
  (globalThis as { WebSocket?: unknown }).WebSocket ??
  class {
    constructor() {
      throw new Error('이 환경에는 WebSocket 이 없어요. Realtime 은 쓰지 않습니다.');
    }
  };

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
        /**
         * 로그인은 6자리 코드가 기본이다 — 딥링크 설정 없이 웹·iOS·안드로이드에서 똑같이 돈다.
         * 다만 메일에는 링크도 함께 오고, 그걸 누르면 토큰이 URL 해시에 실려 돌아온다.
         * 웹에서는 그것도 받아 준다. 코드를 옮겨 적기 귀찮으면 링크를 눌러도 되게.
         * 네이티브는 딥링크가 있어야 해서 끈다.
         */
        detectSessionInUrl: !isServerRender && Platform.OS === 'web',
      },
      realtime: { transport: socketTransport as WebSocketLikeConstructor },
    })
  : null;
