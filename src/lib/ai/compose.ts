import { supabase } from '@/lib/supabase';
import { formatDate, formatPeriod, won } from '@/lib/format';

/**
 * 단톡방에 그대로 붙여넣을 문구 만들기.
 * parse-text 와 달리 읽는 게 아니라 쓰는 쪽이라, Edge Function 을 따로 둔다.
 */

export type ComposeKind = 'dues_reminder' | 'dues_reminder_dm' | 'attendance_nudge' | 'notice';

export type ComposeMatch = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  kickoff: string;
  venue: string;
  opponent: string | null;
};

export type ComposeOptions = {
  kind: ComposeKind;
  teamName: string;
  /** 단톡방에 이름을 적을지. 끄면 인원수만 쓴다. */
  includeNames: boolean;
  note?: string;

  /** 회비 문구용 — YYYY-MM */
  period?: string;
  monthlyDue?: number;
  unpaid?: { name: string; amount: number }[];

  /** 참석 독촉용 */
  match?: ComposeMatch;
  /** 아직 답이 없는 사람들. */
  pending?: { name: string }[];
  attending?: number;

  /** 공지용 — 총무가 고른 틀로 만든 초안. AI 는 이걸 다듬는다. */
  draft?: string;
};

/** 데모 모드에서 쓰는 틀. AI 없이도 화면 흐름을 볼 수 있게 한다. */
function template(options: ComposeOptions): string {
  const { includeNames, kind, note } = options;

  // 공지는 이미 초안이 있다. AI 가 없으면 초안을 그대로 쓴다 — 아무 일도 안 일어나면 안 된다.
  if (kind === 'notice') return [options.draft ?? '', note ?? ''].filter(Boolean).join('\n\n');

  if (kind === 'attendance_nudge') {
    const match = options.match;
    const pending = options.pending ?? [];
    return [
      match ? `${formatDate(match.date)} ${match.kickoff} ${match.venue} 경기 있어요.` : '다음 경기 참석 확인이에요.',
      match?.opponent ? `상대는 ${match.opponent}예요.` : '',
      includeNames
        ? `아직 답 안 주신 분: ${pending.map((row) => row.name).join(', ')}`
        : `${pending.length}명이 아직 답이 없어요.`,
      typeof options.attending === 'number' ? `지금까지 ${options.attending}명 참석이에요.` : '',
      '참석 여부만 남겨 주시면 라인업 짜기가 훨씬 수월해요.',
      note ?? '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const unpaid = options.unpaid ?? [];
  const label = formatPeriod(options.period ?? '');

  if (kind === 'dues_reminder_dm') {
    const one = unpaid[0];
    return [
      `${one.name}님, ${label} 회비 ${won(one.amount)} 아직 안 들어왔어요.`,
      '깜빡하신 것 같아 살짝 남겨요. 계좌는 공지 참고해 주세요.',
      note ?? '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const total = unpaid.reduce((sum, row) => sum + row.amount, 0);
  return [
    `${label} 회비 안내드려요.`,
    includeNames
      ? `아직 안 내신 분: ${unpaid.map((row) => row.name).join(', ')}`
      : `${unpaid.length}명이 아직 안 내셨어요.`,
    `남은 금액은 모두 ${won(total)}입니다. 계좌는 공지 참고해 주세요.`,
    note ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function composeMessage(options: ComposeOptions): Promise<string> {
  if (!supabase) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return template(options);
  }

  const { data, error } = await supabase.functions.invoke<{ message?: string; error?: string }>(
    'compose-message',
    { body: options },
  );

  if (error) throw new Error(error.message || '문구를 만들지 못했어요.');
  if (data?.error) throw new Error(data.error);
  if (!data?.message) throw new Error('문구가 비어 있어요.');
  return data.message;
}
