import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/format';
import type { Member, Team } from '@/lib/types';
import { demoParse } from './demoParser';
import type { ParseIntent, ParseRequest, ParseResponse, RosterEntry } from './contract';

export function toRoster(members: Member[]): RosterEntry[] {
  return members
    .filter((member) => member.active)
    .map((member) => ({
      id: member.id,
      name: member.name,
      nickname: member.nickname,
      backNumber: member.backNumber,
      position: member.preferredPosition,
    }));
}

export type ParseOptions = {
  text: string;
  members: Member[];
  team: Team;
  hint?: Exclude<ParseIntent, 'mixed' | 'unknown'>;
};

/**
 * 자유 텍스트를 구조화 항목으로 바꾼다.
 * Supabase가 연결돼 있으면 parse-text Edge Function(Claude)을, 아니면 데모 파서를 쓴다.
 */
export async function parseText({ text, members, team, hint }: ParseOptions): Promise<ParseResponse> {
  const request: ParseRequest = {
    text,
    hint,
    roster: toRoster(members),
    today: todayISO(),
    monthlyDue: team.monthlyDue,
  };

  if (!supabase) {
    // 데모 모드. 실제 호출과 체감을 맞추려고 약간의 지연을 준다.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return demoParse(request);
  }

  const { data, error } = await supabase.functions.invoke<ParseResponse & { error?: string }>(
    'parse-text',
    { body: request },
  );

  if (error) throw new Error(error.message || 'AI 분석 요청에 실패했습니다.');
  if (!data) throw new Error('AI 응답이 비어 있습니다.');
  if (data.error) throw new Error(data.error);
  return data;
}
