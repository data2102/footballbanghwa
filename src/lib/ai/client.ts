import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/format';
import type { Member, Team } from '@/lib/types';
import { demoParse } from './demoParser';
import type { ParseImage, ParseIntent, ParseRequest, ParseResponse, RosterEntry } from './contract';

export function toRoster(members: Member[]): RosterEntry[] {
  return members
    .filter((member) => member.active)
    .map((member) => ({
      id: member.id,
      name: member.name,
      nickname: member.nickname,
      backNumber: member.backNumber,
      // AI 에는 대표 포지션 하나만 넘긴다. 명단이 길어지면 토큰이 그만큼 늘어난다.
      position: member.positions[0] ?? null,
    }));
}

export type ParseOptions = {
  text: string;
  images?: ParseImage[];
  members: Member[];
  team: Team;
  hint?: Exclude<ParseIntent, 'mixed' | 'unknown'>;
  /** 지금 보고 있는 쿼터. 화이트보드에 쿼터가 안 적혀 있을 때 이 값으로 넣는다. */
  quarter?: number;
};

/**
 * 자유 텍스트를 구조화 항목으로 바꾼다.
 * Supabase가 연결돼 있으면 parse-text Edge Function(Claude)을, 아니면 데모 파서를 쓴다.
 */
export async function parseText({
  text,
  images,
  members,
  team,
  hint,
  quarter,
}: ParseOptions): Promise<ParseResponse> {
  const request: ParseRequest = {
    text,
    images,
    hint,
    quarter,
    roster: toRoster(members),
    today: todayISO(),
    monthlyDue: team.monthlyDue,
  };

  if (!supabase) {
    // 데모 모드. 실제 호출과 체감을 맞추려고 약간의 지연을 준다.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const result = demoParse(request);
    if (images?.length) {
      return {
        ...result,
        summary:
          '데모 모드에서는 사진을 읽지 못해요. Supabase를 연결하면 Claude가 손글씨 명단이나 화이트보드도 읽어요.',
      };
    }
    return result;
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
