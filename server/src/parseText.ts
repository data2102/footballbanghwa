/**
 * parse-text — 자유 한국어 텍스트를 구조화된 팀 운영 데이터로 바꾸는 Claude 프록시.
 *
 * ANTHROPIC_API_KEY 는 이 서버 안에서만 쓰이고 브라우저로 나가지 않는다.
 *
 * 전에는 Supabase Edge Function 이었다. 옮긴 이유는 실행 시간 한도(150초) 하나다 —
 * 아흔 명 명단을 읽는 요청이 그 벽에 붙어서, 나누고 줄여도 계속 WORKER_RESOURCE_LIMIT
 * 으로 죽었다. 읽는 규칙과 스키마는 그대로 옮겼고, HTTP 껍데기만 바뀌었다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { NONE, PARSE_SCHEMA, ROSTER_SCHEMA } from './schema.ts';
import { ROSTER_PROMPT, SYSTEM_PROMPT } from './prompt.ts';
import { json, type Reply } from './reply.ts';
import { fallbackOptions } from './fallback.ts';

/*
 * 기본을 Sonnet 으로 둔다.
 *
 * 카톡 투표 화면을 읽는 건 판단이 아니라 옮겨 적기에 가깝다 — 머리글 아래 이름을
 * 순서대로 베끼는 일이라, 아흔 명이면 그만큼 출력이 길어지고 그 길이가 곧 기다리는
 * 시간이 된다. Opus 로는 그 시간이 Edge Function 제한을 넘겨 아예 실패했다.
 *
 * 이름을 자꾸 틀리게 읽으면 시크릿 하나로 되돌린다 — 배포는 다시 안 해도 된다:
 *   ANTHROPIC_MODEL=claude-opus-5
 * 어느 모델이 읽었는지는 아래 로그 줄에 남는다.
 */
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
const MAX_TEXT_LENGTH = 8000;
const MAX_ROSTER = 200;
/*
 * 요청 하나가 읽는 조각 수. 넉넉히 여덟 장까지 받다가 실패했다 — 조각이 많을수록
 * 읽어 낼 이름이 늘고, 그만큼 출력이 길어져서 Edge Function 이 제한 시간을 넘겼다
 * (WORKER_RESOURCE_LIMIT). 화면에는 "AI 분석에 실패했어요" 만 떴다.
 *
 * 이제 앱이 사진 한 장씩 따로 보낸다(src/lib/ai/client.ts 의 MAX_SLICES_PER_CALL).
 * 여기 값은 그 약속을 넘겨 받지 않도록 막는 울타리다. 두 값은 같이 움직인다.
 *
 * **한 사진의 조각을 갈라 받으면 안 된다.** 말머리가 없는 조각만 받은 요청은 무슨 칸인지
 * 알 수 없어서 사람이 통째로 빠지거나 엉뚱한 칸으로 간다. 그래서 MAX_TILES 만큼 받는다.
 */
const MAX_IMAGES = 6;
/*
 * Anthropic 호출을 우리가 먼저 끊는 시간. Supabase 워커가 죽는 한도보다 짧아야
 * "왜 실패했는지"를 우리가 적어 보낼 수 있다. 넘기면 그냥 WORKER_RESOURCE_LIMIT 만 남는다.
 */
const CALL_TIMEOUT_MS = 110_000;
/** base64 기준. 1568px·품질 0.7 로 줄여 보내면 보통 이 아래로 떨어진다. */
const MAX_IMAGE_BYTES = 4_000_000;

type RosterEntry = {
  id: string;
  name: string;
  nickname: string | null;
  /** 카톡에서 쓰는 다른 이름들. 사람이 한 번 알려 준 것이라 이름보다 강한 단서다. */
  aliases?: string[];
  backNumber: number | null;
  position: string | null;
};

type ParseImage = { mediaType: string; data: string };

type ParseRequest = {
  text?: string;
  images?: ParseImage[];
  hint?: string;
  roster?: RosterEntry[];
  /** 이 요청의 사진들이 전부 어느 칸인지. 사람이 골라 준 값이다. */
  statusHint?: 'attending' | 'late' | 'absent' | 'excused' | 'unknown' | 'pending';
  today?: string;
  monthlyDue?: number;
  /** 앱이 지금 보고 있는 쿼터. 화이트보드에 안 적혀 있을 때 기준으로 알려 준다. */
  quarter?: number;
};

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type AllowedMedia = (typeof ALLOWED_MEDIA)[number];

const isAllowedMedia = (value: string): value is AllowedMedia =>
  (ALLOWED_MEDIA as readonly string[]).includes(value);

/*
 * 스키마에는 union 이 하나도 없다(그래야 Claude 가 받아 준다). 대신 "없음"을
 * 정해진 값으로 받는다 — 글자는 '', 숫자는 -1, 갈래는 'none', 목록은 [].
 * 여기서 그걸 다시 null 로 바꿔 앱에 넘긴다. 앱 타입은 예전 그대로다.
 */
const noneText = (v: unknown): string | null => {
  const text = typeof v === 'string' ? v.trim() : '';
  return text && text !== NONE.choice ? text : null;
};

const noneNum = (v: unknown): number | null =>
  typeof v === 'number' && v >= 0 ? Math.round(v) : null;

const noneChoice = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v && v !== NONE.choice ? v : fallback;

/*
 * 투표 사진은 사람마다 번호 하나로 받는다(ROSTER_SCHEMA). 그걸 앱이 아는 항목 모양으로
 * 다시 펼친다. 앱 타입은 그대로다 — 짧게 받는 약속은 이 함수 안에서 끝난다.
 */
const STATUS_ORDER = ['attending', 'late', 'absent', 'pending'] as const;
const STATUS_QUOTE: Record<string, string> = {
  attending: '투표 화면: 참석',
  late: '투표 화면: 지각',
  absent: '투표 화면: 불참',
  pending: '투표 화면: 미참여',
};

function expandRoster(
  parsed: Record<string, unknown>,
  roster: RosterEntry[],
  /**
   * 사람이 "이 화면은 전부 불참" 이라고 알려 준 칸.
   *
   * 있으면 모델이 어느 배열에 담았든 전부 이 칸으로 본다. 화면을 보고 고른 사람이
   * 모델의 짐작보다 세다 — 애초에 짐작할 일을 없애려고 나눠 찍어 올리는 것이다.
   */
  fixed?: string,
) {
  const items: Record<string, unknown>[] = [];
  const taken = new Set<number>();
  let outOfRange = 0;

  /*
   * 확실한 쪽부터 담는다. 모델이 한 사람을 두 칸에 넣었을 때 참석이 미투표를 이겨야 한다 —
   * 반대로 두면 투표한 사람의 참석 표시가 조용히 사라진다.
   */
  for (const status of STATUS_ORDER) {
    const list = parsed[status];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const at = typeof raw === 'number' ? Math.round(raw) : NaN;
      if (!Number.isInteger(at) || at < 0 || at >= roster.length) {
        outOfRange += 1;
        continue;
      }
      if (taken.has(at)) continue;
      taken.add(at);
      const box = fixed ?? status;
      items.push({
        kind: 'attendance',
        memberId: roster[at].id,
        memberName: roster[at].name,
        confidence: 'high',
        quote: STATUS_QUOTE[box] ?? STATUS_QUOTE[status],
        status: box,
        note: null,
      });
    }
  }

  /*
   * 못 찾은 이름도 항목으로 만든다. memberId 가 비어 있을 뿐 어느 칸에 있었는지는 안다.
   * 그래야 검토 화면에서 "참석 15명" 묶음 안에 같이 서고, 사람이 "이 사람이에요"를
   * 골라 주면 그 칸에 그대로 들어간다. 목록 밖에 따로 두면 연결해도 넣을 데가 없다.
   */
  const unmatched = Array.isArray(parsed.unmatched) ? parsed.unmatched : [];
  for (const raw of unmatched) {
    const one = raw as { name?: unknown; status?: unknown };
    const name = typeof one?.name === 'string' ? one.name.trim() : '';
    if (!name) continue;
    const status =
      fixed ??
      (STATUS_ORDER.includes(one?.status as (typeof STATUS_ORDER)[number])
        ? (one.status as string)
        : 'pending');
    items.push({
      kind: 'attendance',
      memberId: null,
      memberName: name,
      confidence: 'low',
      quote: STATUS_QUOTE[status],
      status,
      note: null,
    });
  }

  // 명단에 없는 번호를 골랐다면 조용히 넘기지 않는다. 그만큼 사람이 빠진 것이다.
  if (outOfRange) {
    console.warn(`명단에 없는 번호 ${outOfRange}개를 건너뛰었습니다. 명단 ${roster.length}명.`);
  }
  return items;
}

/** 스키마가 평평한 객체 하나로 오므로, kind 별로 필요한 필드만 남겨 좁힌다. */
function normalizeItem(raw: Record<string, unknown>) {
  const base = {
    memberId: noneText(raw.memberId),
    memberName: String(raw.memberName ?? '').trim(),
    confidence: noneChoice(raw.confidence, 'low'),
    quote: String(raw.quote ?? ''),
  };

  switch (raw.kind) {
    case 'attendance':
      return {
        kind: 'attendance' as const,
        ...base,
        status: noneChoice(raw.status, 'unknown'),
        note: noneText(raw.note),
      };
    case 'payment':
      return {
        kind: 'payment' as const,
        ...base,
        ledgerKind: noneChoice(raw.ledgerKind, 'due'),
        amount: typeof raw.amount === 'number' ? Math.max(0, Math.round(raw.amount)) : 0,
        period: noneText(raw.period),
        occurredOn: noneText(raw.occurredOn),
        memo: noneText(raw.memo),
      };
    case 'lineup': {
      // 화이트보드에 안 적혀 있으면 -1 로 온다. 앱이 지금 보고 있는 쿼터에 넣는다.
      const quarter = noneNum(raw.quarter);
      return {
        kind: 'lineup' as const,
        ...base,
        slotKey: noneText(raw.slotKey),
        group: noneChoice(raw.group, 'MF'),
        quarter: quarter && quarter >= 1 ? Math.min(6, quarter) : null,
        side: raw.side === 'A' || raw.side === 'B' ? raw.side : null,
      };
    }
    case 'event':
      return {
        kind: 'event' as const,
        ...base,
        type: noneChoice(raw.eventType, 'goal'),
        minute: noneNum(raw.minute),
      };
    case 'profile': {
      const backNumber = noneNum(raw.backNumber);
      return {
        kind: 'profile' as const,
        ...base,
        strengths: Array.isArray(raw.strengths) ? (raw.strengths as string[]).filter(Boolean) : [],
        position: noneText(raw.group),
        backNumber: backNumber !== null && backNumber <= 99 ? backNumber : null,
        note: noneText(raw.note),
      };
    }
    default:
      return null;
  }
}

export async function handleParseText(body: ParseRequest): Promise<Reply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: '서버에 ANTHROPIC_API_KEY 가 없습니다.' }, 500);

  const text = (body.text ?? '').trim();
  const images = (body.images ?? []).slice(0, MAX_IMAGES);
  // 잘린 조각은 화면에서 이름이 통째로 사라지는 것과 같다. 조용히 넘어가지 않는다.
  if ((body.images ?? []).length > MAX_IMAGES) {
    console.warn(`조각 ${(body.images ?? []).length}장 중 ${MAX_IMAGES}장만 읽습니다. 앱이 안 나눠 보냈습니다.`);
  }

  /*
   * 요청이 어떤 모양으로 왔는지 한 줄 남긴다. 사진이 커서 잘린 건지, 형식이 안 맞는 건지,
   * 아예 함수에 안 닿은 건지를 대시보드 로그만 보고 가릴 수 있어야 한다.
   */
  console.log(
    `요청(${MODEL}): 글 ${text.length}자, 사진 ${images.length}장 [` +
      images.map((i) => `${i.mediaType} ${Math.round((i.data?.length ?? 0) / 1024)}KB`).join(', ') +
      `], 명단 ${(body.roster ?? []).length}명`,
  );

  if (!text && images.length === 0) {
    return json({ error: '분석할 내용이 없습니다. 글을 쓰거나 사진을 올려주세요.' }, 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return json({ error: `글이 너무 깁니다. ${MAX_TEXT_LENGTH}자 이하로 나눠서 보내주세요.` }, 400);
  }
  /*
   * 확인과 좁히기를 한 번에 한다. 확인만 하고 원래 배열을 그대로 쓰면 형식이 string 이라
   * SDK 가 안 받는다 — Deno 에서는 타입 검사를 안 돌려서 이게 안 보였다.
   */
  const checked: { mediaType: AllowedMedia; data: string }[] = [];
  for (const image of images) {
    if (!isAllowedMedia(image.mediaType)) {
      return json({ error: `지원하지 않는 이미지 형식입니다: ${image.mediaType}` }, 400);
    }
    // base64 4글자가 원본 3바이트다.
    if ((image.data?.length ?? 0) * 0.75 > MAX_IMAGE_BYTES) {
      return json({ error: '사진 용량이 너무 큽니다. 앱에서 줄여서 다시 보내주세요.' }, 400);
    }
    checked.push({ mediaType: image.mediaType, data: image.data });
  }

  const roster = (body.roster ?? []).slice(0, MAX_ROSTER);
  const today = body.today ?? new Date().toISOString().slice(0, 10);
  const hint = body.hint ?? '';

  /*
   * 투표 사진은 짧은 출력 경로로 보낸다.
   *
   * 긴 쪽은 항목 하나에 스무 칸을 채우게 해서 한 사람에 약 115토큰이 든다. 아흔 명이면
   * 출력만 1만 토큰이고 그걸 쓰는 시간이 그대로 실행 한도를 넘겼다(WORKER_RESOURCE_LIMIT).
   * 투표 화면은 "누가 어느 칸에 있나"만 알면 되는 일이라 번호로만 받는다.
   *
   * 글이 같이 왔으면 긴 쪽으로 보낸다 — 짧은 출력에는 사유("출장", "30분 늦음")를
   * 담을 칸이 없어서, 사람이 적어 보낸 말을 조용히 버리게 된다.
   */
  const compact = hint === 'attendance' && images.length > 0 && !text;

  /*
   * 사람이 "이 화면은 전부 불참" 이라고 골라 준 칸.
   *
   * 통째로 올린 캡처는 말머리("불참 : 35명") 아래로 이름이 이어지는데, 긴 화면은 조각으로
   * 잘려서 말머리 없이 이름부터 시작하는 조각이 생긴다. 그러면 모델이 그 이름들을 어느
   * 칸인지 몰라 버린다. 칸별로 따로 찍어 올리면 **읽을 것이 이름뿐이라** 그 실수가 없다.
   */
  const statusHint = compact ? body.statusHint : undefined;
  const STATUS_LABEL: Record<string, string> = {
    attending: '참석',
    late: '지각',
    absent: '불참',
    pending: '미투표(미참여)',
    excused: '사유 불참',
    unknown: '미투표',
  };

  // 가변 정보는 전부 user 메시지로. system은 고정이라 프롬프트 캐시가 걸린다.
  const prompt = [
    `오늘 날짜: ${today}`,
    body.monthlyDue ? `팀 기본 월 회비: ${body.monthlyDue}원` : null,
    body.quarter
      ? `앱이 지금 보고 있는 쿼터는 ${body.quarter}쿼터입니다. 화이트보드에 쿼터가 안 적혀 있으면 quarter 를 null 로 두십시오.`
      : null,
    hint && !compact ? `사용자가 연 화면: ${hint} (힌트일 뿐, 내용이 다르면 내용을 따르십시오)` : null,
    /*
     * 칸을 못 박아 준다. 이러면 말머리를 찾을 필요도, 조각 사이로 이어 붙일 필요도 없다.
     * 화면에 보이는 이름을 전부 담기만 하면 된다.
     */
    statusHint
      ? `## 이 화면은 전부 "${STATUS_LABEL[statusHint] ?? statusHint}" 입니다\n` +
        `사용자가 그 칸만 따로 찍어 올렸습니다. **말머리를 찾을 필요가 없습니다.**\n` +
        `화면에 보이는 이름을 하나도 빼지 말고 전부 ${statusHint === 'pending' ? 'pending' : statusHint} 배열에 담으십시오.\n` +
        `다른 배열은 비워 두십시오. 명단에서 못 찾은 이름만 unmatched 에 넣습니다.`
      : null,
    images.length ? `첨부한 사진 ${images.length}장도 함께 읽으십시오.` : null,
    '',
    compact ? '## 팀 명단 (번호 이름)' : '## 팀 명단 (JSON)',
    /*
     * 짧은 경로에서는 명단도 줄글로 준다. 같은 아흔 명이 JSON 으로는 3천 토큰인데
     * 번호 줄로는 900 토큰이다. 답이 번호라서 그 이상은 필요 없다.
     */
    compact
      ? roster
          .map((one, at) => {
            /*
             * 별명을 같이 적는다. 카톡 이름("화이팅", "Bong")은 실제 이름과 글자가 안 겹쳐서
             * 이게 없으면 영영 못 맞힌다. 사람이 한 번 알려 준 값이라 이름만큼 믿을 만하다.
             */
            const extra = [
              one.nickname,
              ...(one.aliases ?? []),
              one.backNumber ? `${one.backNumber}번` : null,
            ]
              .filter(Boolean)
              .join(', ');
            return extra ? `${at} ${one.name} (${extra})` : `${at} ${one.name}`;
          })
          .join('\n')
      : JSON.stringify(roster),
    '',
    text ? '## 분석할 원문' : '## 글 없이 사진만 왔습니다',
    ...(text ? ['<<<', text, '>>>'] : []),
  ]
    .filter((line) => line !== null)
    .join('\n');

  // 이미지를 글보다 앞에 두면 모델이 사진을 먼저 훑고 지시를 읽는다.
  const userContent = [
    ...checked.map((image) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: image.mediaType, data: image.data },
    })),
    { type: 'text' as const, text: prompt },
  ];

  /*
   * 실행 한도에 걸리면 Supabase 가 워커를 죽이고 WORKER_RESOURCE_LIMIT 만 남긴다 —
   * 어디서 죽었는지가 로그에도 안 남아서, 사진이 문제인지 출력이 긴 게 문제인지 갈리지 않는다.
   * 우리가 먼저 끊으면 "무엇이 오래 걸렸다"를 적어 둘 수 있다.
   */
  const client = new Anthropic({ apiKey, timeout: CALL_TIMEOUT_MS, maxRetries: 0 });
  const startedAt = Date.now();

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      /*
       * 짧은 경로도 넉넉히 열어 둔다. 답 자체는 400토큰이지만 **생각한 양도 여기에 든다.**
       * 좁게 잡으면 생각하다 한도에 닿아 JSON 이 잘리고, 그러면 읽은 게 통째로 날아간다.
       */
      max_tokens: 16000,
      // 안전 분류기가 거절하면 서버가 다른 모델로 넘긴다. 받는 모델에만 붙는다.
      ...fallbackOptions(MODEL),
      system: [
        {
          type: 'text',
          text: compact ? ROSTER_PROMPT : SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        /*
         * 짧은 경로를 low 로 뒀던 건 Edge Function 의 150초 벽 때문이었다. Render 로 옮겨서
         * 그 벽이 없어졌는데 low 만 남아 있었다 — 사진 여섯 장에서 아흔 명을 빠짐없이
         * 골라내는 일에 제일 낮은 단을 쓸 이유가 없다. 빠뜨린 사람은 앱에서 "미정"이 되어
         * 아무 표시 없이 남고, 총무는 그게 화면에 없었는지 못 읽은 건지 알 수가 없다.
         * 출력은 여전히 400토큰이라 느려지는 건 생각하는 시간뿐이다.
         */
        effort: 'high',
        format: { type: 'json_schema', schema: compact ? ROSTER_SCHEMA : PARSE_SCHEMA },
      },
      messages: [{ role: 'user', content: userContent }],
    });

    /*
     * 얼마나 걸렸고 얼마나 썼는지 남긴다. 한도에 다시 닿으면 여기 숫자로 바로 안다 —
     * 출력 토큰이 그대로 시간이다.
     */
    console.log(
      `응답: ${Date.now() - startedAt}ms, 출력 ${response.usage.output_tokens}토큰` +
        `, 입력 ${response.usage.input_tokens}토큰 (${compact ? '짧은' : '긴'} 경로)`,
    );

    if (response.stop_reason === 'refusal') {
      return json({ error: '이 내용은 분석할 수 없습니다. 문구를 바꿔 다시 시도해 주세요.' }, 422);
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return json({ error: 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.' }, 502);
    }

    const parsed = JSON.parse(textBlock.text) as {
      intent?: string;
      formation?: string | null;
      items?: Record<string, unknown>[];
      unmatched?: string[];
      summary?: string;
    };

    const items = compact
      ? expandRoster(parsed as Record<string, unknown>, roster, statusHint)
      : (parsed.items ?? []).map(normalizeItem).filter((item) => item !== null);

    return json({
      intent: compact ? 'attendance' : (parsed.intent ?? 'unknown'),
      formation: parsed.formation ?? null,
      items,
      /*
       * 앱에는 이름만 준다. 칸 정보는 위에서 항목으로 펼쳐 넣었고,
       * 여기는 "명단에서 못 찾은 이름" 목록을 보여 주는 자리다(앱 타입 그대로).
       */
      unmatched: (parsed.unmatched ?? []).map((one) =>
        typeof one === 'string' ? one : String((one as { name?: unknown })?.name ?? ''),
      ).filter(Boolean),
      summary: parsed.summary ?? '',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`parse-text 실패 (${Date.now() - startedAt}ms)`, status, message);

    if (/timeout|aborted/i.test(message)) {
      return json(
        {
          error:
            `사진 읽기가 ${Math.round(CALL_TIMEOUT_MS / 1000)}초 안에 안 끝났어요. ` +
            '사진을 한 장씩 나눠 올리거나, 화면을 짧게 잘라서 다시 올려 주세요.',
        },
        504,
      );
    }
    if (status === 429) return json({ error: '요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    if (status && status >= 500) return json({ error: 'AI 서비스가 응답하지 않습니다.' }, 502);
    return json({ error: `분석에 실패했습니다: ${message}` }, 500);
  }
}
