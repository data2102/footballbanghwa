import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRemoteConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * 환경변수가 없으면 null. 호출부는 반드시 null 체크를 하고,
 * null이면 기기 저장소 기반 데모 모드로 동작한다.
 */
export const supabase: SupabaseClient | null = isRemoteConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // RN에는 URL 콜백이 없다. 웹에서만 URL 세션 감지를 켠다.
        detectSessionInUrl: false,
      },
    })
  : null;
