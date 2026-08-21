import { supabase } from '@/lib/supabase';
import { callAi } from '@/lib/ai/aiFetch';
import { describeInvokeError, failureToError } from '@/lib/ai/invokeError';
import { todayISO } from '@/lib/format';
import type { Member, Team } from '@/lib/types';
import { demoParse } from './demoParser';
import type {
  ParseImage,
  ParseIntent,
  ParseRequest,
  ParseResponse,
  ParsedItem,
  RosterEntry,
} from './contract';

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

/*
 * 사진 한 장마다 요청을 따로 보낸다.
 *
 * 전에는 조각을 전부 모아 한 번에 보냈다. 카톡 투표 캡처 두 장이면 조각이 예닐곱 장이고,
 * 아흔 명을 한 요청에서 다 읽느라 Edge Function 이 제한 시간을 넘겨 죽었다 —
 * WORKER_RESOURCE_LIMIT 로 끝나고 화면에는 "AI 분석에 실패했어요" 만 떴다.
 *
 * 나눠 보내면 두 가지가 같이 좋아진다. 요청 하나가 짧아져 제한에 안 걸리고,
 * 여러 장이 동시에 읽혀서 기다리는 시간이 장수만큼 늘지 않는다.
 *
 * 조각을 사진 단위로 묶는 건 맥락 때문이다. "참석 15명" 같은 머리글은 첫 조각에만
 * 있어서, 같은 사진의 조각을 갈라 보내면 아랫조각이 무슨 칸인지 모른다.
 */
/** 요청 하나에 실을 수 있는 조각 수. 사진 하나가 이보다 잘게 잘렸으면 그때만 더 나눈다. */
const MAX_SLICES_PER_CALL = 4;

/** 사진 몇 장 중 몇 장을 읽었는지. 기다리는 동안 화면에 보여 준다. */
export type ParseProgress = { done: number; total: number };

export type ParseOptions = {
  text: string;
  /**
   * 사진 한 장이 배열 하나다. 긴 캡처는 조각 여러 개가 모여 한 장을 이룬다.
   * 조각을 통째로 평평하게 넘기면 어디까지가 한 장인지 알 수 없어서 나눠 보낼 수 없다.
   */
  photos?: ParseImage[][];
  members: Member[];
  team: Team;
  hint?: Exclude<ParseIntent, 'mixed' | 'unknown'>;
  /** 지금 보고 있는 쿼터. 화이트보드에 쿼터가 안 적혀 있을 때 이 값으로 넣는다. */
  quarter?: number;
  onProgress?: (progress: ParseProgress) => void;
};

/** 사진들을 요청 단위로 묶는다. 한 장이 너무 잘게 잘렸으면 그 장만 다시 나눈다. */
function toBatches(photos: ParseImage[][]): ParseImage[][] {
  const batches: ParseImage[][] = [];
  for (const slices of photos) {
    if (!slices.length) continue;
    for (let at = 0; at < slices.length; at += MAX_SLICES_PER_CALL) {
      batches.push(slices.slice(at, at + MAX_SLICES_PER_CALL));
    }
  }
  return batches;
}

/**
 * 같은 사람이 두 요청에서 겹쳐 나올 때 하나로 묶는 열쇠.
 *
 * 회비와 기록은 열쇠를 만들지 않는다 — 한 사람이 한 경기에 골을 두 번 넣을 수 있고,
 * 회비도 여러 달을 한 번에 낼 수 있다. 그걸 합치면 없던 일이 된다.
 * 중복이 남는 쪽은 사용자가 체크를 풀면 그만이지만, 합쳐서 사라진 건 되살릴 수 없다.
 */
function dedupeKey(item: ParsedItem): string | null {
  const who = item.memberId ?? item.memberName.trim();
  if (!who) return null;
  switch (item.kind) {
    case 'attendance':
      return `attendance|${who}`;
    case 'profile':
      return `profile|${who}`;
    case 'lineup':
      return `lineup|${who}|${item.quarter ?? ''}|${item.side ?? ''}`;
    default:
      return null;
  }
}

const RANK = { high: 3, medium: 2, low: 1 } as const;

/** 같은 열쇠로 두 번 나왔을 때 어느 쪽을 남길지. */
function preferred(kept: ParsedItem, next: ParsedItem): ParsedItem {
  /*
   * 항목별 탭(참석·불참)과 미참여 탭에 같은 이름이 다 있으면, 투표를 했다는 쪽이 맞다.
   * 미투표로 남기면 그 사람의 참석 표시가 조용히 지워진다.
   */
  if (kept.kind === 'attendance' && next.kind === 'attendance') {
    if (kept.status === 'pending' && next.status !== 'pending') return next;
    if (next.status === 'pending' && kept.status !== 'pending') return kept;
  }
  // 회원 카드는 사진마다 다른 장점이 보일 수 있으니 태그를 합친다.
  if (kept.kind === 'profile' && next.kind === 'profile') {
    return { ...kept, strengths: [...new Set([...kept.strengths, ...next.strengths])] };
  }
  return RANK[next.confidence] > RANK[kept.confidence] ? next : kept;
}

/** 사진별로 따로 읽어 온 결과를 검토 화면 하나에 얹을 수 있게 합친다. */
function mergeResponses(parts: ParseResponse[]): ParseResponse {
  if (parts.length === 1) return parts[0];

  const items: ParsedItem[] = [];
  const seen = new Map<string, number>();
  for (const part of parts) {
    for (const item of part.items) {
      const key = dedupeKey(item);
      const at = key ? seen.get(key) : undefined;
      if (key && at !== undefined) {
        items[at] = preferred(items[at], item);
        continue;
      }
      if (key) seen.set(key, items.length);
      items.push(item);
    }
  }

  const intents = new Set(parts.map((part) => part.intent).filter((intent) => intent !== 'unknown'));
  const intent: ParseIntent =
    intents.size === 0 ? 'unknown' : intents.size === 1 ? [...intents][0] : 'mixed';

  return {
    intent,
    formation: parts.find((part) => part.formation)?.formation ?? null,
    items,
    unmatched: [...new Set(parts.flatMap((part) => part.unmatched))],
    summary: [...new Set(parts.map((part) => part.summary.trim()).filter(Boolean))].join(' '),
  };
}

async function invokeParse(request: ParseRequest): Promise<ParseResponse> {
  try {
    const data = await callAi<ParseResponse & { error?: string }>('parse-text', request);
    if (!data) throw new Error('AI 응답이 비어 있습니다.');
    if (data.error) throw new Error(data.error);
    return data;
  } catch (error) {
    // 이미 우리말로 적어 둔 오류는 그대로 올린다. 서버가 답한 것만 풀어서 본다.
    if (error instanceof Error && !(error as { context?: unknown }).context) throw error;
    throw failureToError(await describeInvokeError(error, 'AI 분석 요청에 실패했어요.'));
  }
}

/**
 * 자유 텍스트를 구조화 항목으로 바꾼다.
 * Supabase가 연결돼 있으면 parse-text Edge Function(Claude)을, 아니면 데모 파서를 쓴다.
 */
export async function parseText({
  text,
  photos,
  members,
  team,
  hint,
  quarter,
  onProgress,
}: ParseOptions): Promise<ParseResponse> {
  const base = {
    hint,
    quarter,
    roster: toRoster(members),
    today: todayISO(),
    monthlyDue: team.monthlyDue,
  };
  const batches = toBatches(photos ?? []);

  if (!supabase) {
    // 데모 모드. 실제 호출과 체감을 맞추려고 약간의 지연을 준다.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const result = demoParse({ ...base, text, images: batches.flat() });
    if (batches.length) {
      return {
        ...result,
        summary:
          '데모 모드에서는 사진을 읽지 못해요. Supabase를 연결하면 Claude가 손글씨 명단이나 화이트보드도 읽어요.',
      };
    }
    return result;
  }

  /*
   * 글은 사진과 같이 싣지 않고 요청 하나를 따로 쓴다.
   *
   * 두 가지 때문이다. 첫째, 요청마다 같은 글을 붙이면 같은 항목이 요청 수만큼 나온다 —
   * 회비 입금 문자 하나가 세 건이 되고, 총무가 그걸 되돌리는 비용이 크다.
   * 둘째, 투표 사진은 함수가 짧은 출력 경로로 읽는데(번호만 받는다) 그 경로에는
   * 사유("출장", "30분 늦음")를 담을 칸이 없다. 글을 얹으면 그 요청만 긴 경로로 넘어가
   * 다시 실행 한도에 걸린다. 떼어 두면 사진은 짧게, 글은 글대로 읽힌다.
   */
  const calls: ParseRequest[] = [
    ...(text.trim() ? [{ ...base, text }] : []),
    ...batches.map((images) => ({ ...base, text: '', images })),
  ];
  if (!calls.length) calls.push({ ...base, text });

  let done = 0;
  onProgress?.({ done, total: calls.length });

  const settled = await Promise.allSettled(
    calls.map(async (request) => {
      const result = await invokeParse(request);
      done += 1;
      onProgress?.({ done, total: calls.length });
      return result;
    }),
  );

  const ok = settled.flatMap((one) => (one.status === 'fulfilled' ? [one.value] : []));
  const failed = settled.flatMap((one) => (one.status === 'rejected' ? [one.reason] : []));

  // 전부 실패했으면 첫 이유를 그대로 올린다. 이미 한국어로 풀어 둔 문장이다.
  if (!ok.length) {
    const first = failed[0];
    throw first instanceof Error ? first : new Error('AI 분석에 실패했어요.');
  }

  const merged = mergeResponses(ok);
  /*
   * 한 장이라도 읽혔으면 그것만이라도 보여 준다. 어차피 체크박스로 확인하고 저장하니
   * 절반이라도 손으로 치는 것보다 낫다. 대신 빠진 게 있다는 걸 분명히 적는다.
   */
  if (failed.length) {
    merged.summary =
      `${merged.summary} 사진 ${failed.length}장은 못 읽었어요 — 그 장만 다시 올려 주세요.`.trim();
  }
  return merged;
}
