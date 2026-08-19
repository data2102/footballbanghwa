/**
 * parse-text — 자유 한국어 텍스트를 구조화된 팀 운영 데이터로 바꾸는 Claude 프록시.
 *
 * ANTHROPIC_API_KEY 는 이 함수 안에서만 쓰이고 클라이언트로 나가지 않는다.
 * 배포:  supabase functions deploy parse-text
 * 시크릿: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.117.1';
import { corsHeaders, json } from '../_shared/cors.ts';
import { PARSE_SCHEMA } from '../_shared/schema.ts';
import { SYSTEM_PROMPT } from '../_shared/prompt.ts';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5';
const MAX_TEXT_LENGTH = 8000;
const MAX_ROSTER = 200;
const MAX_IMAGES = 4;
/** base64 기준. 1568px·품질 0.7 로 줄여 보내면 보통 이 아래로 떨어진다. */
const MAX_IMAGE_BYTES = 4_000_000;

type RosterEntry = {
  id: string;
  name: string;
  nickname: string | null;
  backNumber: number | null;
  position: string | null;
};

type ParseImage = { mediaType: string; data: string };

type ParseRequest = {
  text?: string;
  images?: ParseImage[];
  hint?: string;
  roster?: RosterEntry[];
  today?: string;
  monthlyDue?: number;
};

const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** 스키마가 평평한 객체 하나로 오므로, kind 별로 필요한 필드만 남겨 좁힌다. */
function normalizeItem(raw: Record<string, unknown>) {
  const base = {
    memberId: (raw.memberId as string | null) ?? null,
    memberName: String(raw.memberName ?? '').trim(),
    confidence: (raw.confidence as string) ?? 'low',
    quote: String(raw.quote ?? ''),
  };

  switch (raw.kind) {
    case 'attendance':
      return {
        kind: 'attendance' as const,
        ...base,
        status: (raw.status as string) ?? 'unknown',
        note: (raw.note as string | null) ?? null,
      };
    case 'payment':
      return {
        kind: 'payment' as const,
        ...base,
        ledgerKind: (raw.ledgerKind as string) ?? 'due',
        amount: typeof raw.amount === 'number' ? Math.round(raw.amount) : 0,
        period: (raw.period as string | null) ?? null,
        occurredOn: (raw.occurredOn as string | null) ?? null,
        memo: (raw.memo as string | null) ?? null,
      };
    case 'lineup':
      return {
        kind: 'lineup' as const,
        ...base,
        slotKey: (raw.slotKey as string | null) ?? null,
        group: (raw.group as string) ?? 'MF',
      };
    case 'event':
      return {
        kind: 'event' as const,
        ...base,
        type: (raw.eventType as string) ?? 'goal',
        minute: typeof raw.minute === 'number' ? raw.minute : null,
      };
    case 'profile':
      return {
        kind: 'profile' as const,
        ...base,
        strengths: Array.isArray(raw.strengths) ? (raw.strengths as string[]).filter(Boolean) : [],
        position: (raw.group as string | null) ?? null,
        backNumber: typeof raw.backNumber === 'number' ? raw.backNumber : null,
        note: (raw.note as string | null) ?? null,
      };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST만 지원합니다.' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY 시크릿이 설정되지 않았습니다.' }, 500);

  let body: ParseRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: '요청 본문이 JSON이 아닙니다.' }, 400);
  }

  const text = (body.text ?? '').trim();
  const images = (body.images ?? []).slice(0, MAX_IMAGES);

  if (!text && images.length === 0) {
    return json({ error: '분석할 내용이 없습니다. 글을 쓰거나 사진을 올려주세요.' }, 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return json({ error: `글이 너무 깁니다. ${MAX_TEXT_LENGTH}자 이하로 나눠서 보내주세요.` }, 400);
  }
  for (const image of images) {
    if (!ALLOWED_MEDIA.includes(image.mediaType)) {
      return json({ error: `지원하지 않는 이미지 형식입니다: ${image.mediaType}` }, 400);
    }
    // base64 4글자가 원본 3바이트다.
    if ((image.data?.length ?? 0) * 0.75 > MAX_IMAGE_BYTES) {
      return json({ error: '사진 용량이 너무 큽니다. 앱에서 줄여서 다시 보내주세요.' }, 400);
    }
  }

  const roster = (body.roster ?? []).slice(0, MAX_ROSTER);
  const today = body.today ?? new Date().toISOString().slice(0, 10);

  // 가변 정보는 전부 user 메시지로. system은 고정이라 프롬프트 캐시가 걸린다.
  const prompt = [
    `오늘 날짜: ${today}`,
    body.monthlyDue ? `팀 기본 월 회비: ${body.monthlyDue}원` : null,
    body.hint ? `사용자가 연 화면: ${body.hint} (힌트일 뿐, 내용이 다르면 내용을 따르십시오)` : null,
    images.length ? `첨부한 사진 ${images.length}장도 함께 읽으십시오.` : null,
    '',
    '## 팀 명단 (JSON)',
    JSON.stringify(roster),
    '',
    text ? '## 분석할 원문' : '## 글 없이 사진만 왔습니다',
    ...(text ? ['<<<', text, '>>>'] : []),
  ]
    .filter((line) => line !== null)
    .join('\n');

  // 이미지를 글보다 앞에 두면 모델이 사진을 먼저 훑고 지시를 읽는다.
  const userContent = [
    ...images.map((image) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: image.mediaType, data: image.data },
    })),
    { type: 'text' as const, text: prompt },
  ];

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // 안전 분류기가 요청을 거절하면 서버가 알아서 다른 모델로 넘긴다.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: PARSE_SCHEMA },
      },
      messages: [{ role: 'user', content: userContent }],
    });

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

    const items = (parsed.items ?? []).map(normalizeItem).filter((item) => item !== null);

    return json({
      intent: parsed.intent ?? 'unknown',
      formation: parsed.formation ?? null,
      items,
      unmatched: parsed.unmatched ?? [],
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
    console.error('parse-text failed', status, message);

    if (status === 429) return json({ error: '요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    if (status && status >= 500) return json({ error: 'AI 서비스가 응답하지 않습니다.' }, 502);
    return json({ error: `분석에 실패했습니다: ${message}` }, 500);
  }
});
