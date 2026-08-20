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

/**
 * 문구 초안이 지금 이 기기에만 있는지.
 *
 * `message_templates` 표가 아직 없는 팀에서 true 다. 화면이 이걸 보고
 * "이 기기에만 저장돼요"를 알린다 — 조용히 두면 폰에서 안 보인다고 앱을 의심한다.
 * load() 가 끝난 뒤에야 값이 정해지므로 함수로 둔다.
 */
export function templatesAreLocal(): boolean {
  if (repo.kind === 'local') return false;
  return (repo as { templatesAreLocal?: boolean }).templatesAreLocal === true;
}
export { LocalRepo };
export type { Repo };
