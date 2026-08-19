import { supabase } from '@/lib/supabase';
import { formatPeriod, won } from '@/lib/format';

/**
 * 회비 안내 문구 만들기.
 * parse-text 와 달리 읽는 게 아니라 쓰는 쪽이라, Edge Function 을 따로 둔다.
 */

export type ComposeKind = 'dues_reminder' | 'dues_reminder_dm';

export type ComposeOptions = {
  kind: ComposeKind;
  teamName: string;
  /** YYYY-MM */
  period: string;
  monthlyDue: number;
  unpaid: { name: string; amount: number }[];
  includeNames: boolean;
  note?: string;
};

/** 데모 모드에서 쓰는 틀. AI 없이도 화면 흐름을 볼 수 있게 한다. */
function template(options: ComposeOptions): string {
  const { unpaid, period, includeNames, kind, note } = options;
  const label = formatPeriod(period);

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
    {
      body: {
        kind: options.kind,
        teamName: options.teamName,
        period: options.period,
        monthlyDue: options.monthlyDue,
        unpaid: options.unpaid,
        includeNames: options.includeNames,
        note: options.note,
      },
    },
  );

  if (error) throw new Error(error.message || '문구를 만들지 못했어요.');
  if (data?.error) throw new Error(data.error);
  if (!data?.message) throw new Error('문구가 비어 있어요.');
  return data.message;
}
