/**
 * compose-message — 총무가 단톡방에 그대로 붙여넣을 안내 문구를 만든다.
 *
 * 회비 독촉은 말투 하나로 팀 분위기가 갈린다. 총무가 매달 문장을 새로 고민하지 않게,
 * 금액과 이름만 넘기면 문구가 나오게 했다. 나온 문구는 화면에서 고칠 수 있다.
 *
 * 배포: supabase functions deploy compose-message
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.117.1';
import { corsHeaders, json } from '../_shared/cors.ts';
import { COMPOSE_SYSTEM_PROMPT } from '../_shared/prompt.ts';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5';
const MAX_NAMES = 60;

type ComposeRequest = {
  kind?: 'dues_reminder' | 'dues_reminder_dm' | 'attendance_nudge' | 'notice';
  teamName?: string;
  /** '2026-08' */
  period?: string;
  monthlyDue?: number;
  /** 미납자. dm 이면 한 명만 넘긴다. */
  unpaid?: { name: string; amount: number }[];
  /** 단톡방에 이름을 적을지. 끄면 인원수만 쓴다. */
  includeNames?: boolean;
  /** 총무가 덧붙이고 싶은 말. 예: "이번 주까지 부탁드려요" */
  note?: string;

  /** 참석 독촉용 */
  match?: { date?: string; kickoff?: string; venue?: string; opponent?: string | null };
  pending?: { name: string }[];
  attending?: number;

  /** 공지용 — 총무가 고른 틀로 만든 초안. 다듬어서 돌려준다. */
  draft?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST만 지원합니다.' }, 405);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY 시크릿이 설정되지 않았습니다.' }, 500);

  let body: ComposeRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: '요청 본문이 JSON이 아닙니다.' }, 400);
  }

  const kind = body.kind ?? 'dues_reminder';
  const teamName = body.teamName ?? '우리 팀';

  /*
   * 종류마다 넘어오는 게 다르다. 회비 독촉만 있던 시절에는 미납자가 없으면 400 을 냈는데,
   * 참석 독촉과 공지가 들어오면서 그 검사가 엉뚱한 요청을 막았다. 종류별로 갈라 둔다.
   */
  let lines: string[];

  if (kind === 'notice') {
    const draft = (body.draft ?? '').trim();
    if (!draft) return json({ error: '다듬을 초안이 없습니다.' }, 400);
    lines = [
      '보낼 곳: 팀 단톡방',
      `팀 이름: ${teamName}`,
      '아래 초안을 단톡방에 그대로 붙여넣을 수 있게 다듬으십시오.',
      '사실(날짜·시간·장소·금액·인원)은 절대 바꾸거나 지어내지 마십시오. 없는 정보를 채우지 마십시오.',
      body.note ? `총무가 덧붙이고 싶은 말: ${body.note}` : null,
      '',
      '## 초안',
      draft,
    ].filter((line) => line !== null) as string[];
  } else if (kind === 'attendance_nudge') {
    const pending = (body.pending ?? []).slice(0, MAX_NAMES);
    const match = body.match;
    lines = [
      '보낼 곳: 팀 단톡방',
      `팀 이름: ${teamName}`,
      match?.date ? `경기: ${match.date} ${match.kickoff ?? ''} ${match.venue ?? ''}`.trim() : null,
      match?.opponent ? `상대: ${match.opponent}` : null,
      typeof body.attending === 'number' ? `지금까지 참석: ${body.attending}명` : null,
      body.includeNames
        ? `아직 답이 없는 사람: ${pending.map((row) => row.name).join(', ')}`
        : `아직 답이 없는 사람 ${pending.length}명. 이름은 쓰지 마십시오.`,
      '라인업을 미리 짜려면 답이 필요하다는 이유를 한 번만 덧붙이십시오. 다그치지 마십시오.',
      body.note ? `총무가 덧붙이고 싶은 말: ${body.note}` : null,
    ].filter((line) => line !== null) as string[];
  } else {
    const unpaid = (body.unpaid ?? []).slice(0, MAX_NAMES);
    if (unpaid.length === 0) return json({ error: '미납자가 없습니다.' }, 400);

    const isDm = kind === 'dues_reminder_dm';
    const total = unpaid.reduce((sum, row) => sum + row.amount, 0);
    const [year, month] = (body.period ?? '').split('-');

    lines = [
      `보낼 곳: ${isDm ? '개인 메시지(1:1)' : '팀 단톡방'}`,
      `팀 이름: ${teamName}`,
      year && month ? `대상 달: ${year}년 ${Number(month)}월` : null,
      body.monthlyDue ? `월 회비: ${body.monthlyDue}원` : null,
      `미납 인원: ${unpaid.length}명, 합계 ${total}원`,
      isDm || body.includeNames
        ? `미납자: ${unpaid.map((row) => `${row.name} ${row.amount}원`).join(', ')}`
        : '미납자 이름은 쓰지 마십시오. 인원수만 언급합니다.',
      body.note ? `총무가 덧붙이고 싶은 말: ${body.note}` : null,
    ].filter((line) => line !== null) as string[];
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: COMPOSE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      // 짧은 문구 하나라 깊게 생각할 이유가 없다. 응답이 빨라야 쓸 만하다.
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: lines.join('\n') }],
    });

    if (response.stop_reason === 'refusal') {
      return json({ error: '이 내용으로는 문구를 만들 수 없습니다.' }, 422);
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return json({ error: 'AI 응답을 읽지 못했습니다.' }, 502);
    }

    return json({ message: textBlock.text.trim() });
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : String(error);
    console.error('compose-message failed', status, message);
    if (status === 429) return json({ error: '요청이 몰렸습니다. 잠시 후 다시 시도해 주세요.' }, 429);
    if (status && status >= 500) return json({ error: 'AI 서비스가 응답하지 않습니다.' }, 502);
    return json({ error: `문구를 만들지 못했습니다: ${message}` }, 500);
  }
});
