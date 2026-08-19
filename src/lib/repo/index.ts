import { supabase } from '@/lib/supabase';
import { LocalRepo } from './local';
import { SupabaseRepo } from './supabase';
import type { Repo } from './types';

/**
 * 환경변수 유무로 저장소를 고른다.
 * 이 결정은 앱 실행 중에 바뀌지 않으므로 모듈 로드 시 한 번만 한다.
 */
export const repo: Repo = supabase ? new SupabaseRepo(supabase) : new LocalRepo();

export const isLocalRepo = repo.kind === 'local';
export { LocalRepo };
export type { Repo };
