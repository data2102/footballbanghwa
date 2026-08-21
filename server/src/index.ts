/**
 * 우리팀 매니저의 AI 프록시.
 *
 * Anthropic 키는 여기에만 있다. 앱 번들에는 절대 들어가지 않는다.
 *
 * 왜 Supabase Edge Function 에서 옮겼나 — 실행 시간 한도(150초) 하나 때문이다.
 * 아흔 명 명단을 읽는 요청이 그 벽에 붙어서, 요청을 나누고 출력을 25분의 1로 줄여도
 * WORKER_RESOURCE_LIMIT 으로 계속 죽었다. 여기에는 그 벽이 없다.
 *
 * 옮기면서 잃은 것은 "로그인한 사람인지"를 공짜로 검사해 주던 것이다.
 * 그래서 auth.ts 가 그 몫을 한다 — 이게 없으면 주소만 아는 사람이 우리 키를 쓴다.
 */
import { createServer } from 'node:http';
import { handleParseText } from './parseText.ts';
import { handleComposeMessage } from './composeMessage.ts';
import { authConfigured, requireUser } from './auth.ts';
import { BodyTooLarge, corsHeaders, readJson, send } from './http.ts';
import type { Reply } from './reply.ts';

const PORT = Number(process.env.PORT ?? 10000);

const ROUTES: Record<string, (body: never) => Promise<Reply>> = {
  '/parse-text': handleParseText as (body: never) => Promise<Reply>,
  '/compose-message': handleComposeMessage as (body: never) => Promise<Reply>,
};

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0].replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  /*
   * 무료 플랜은 15분 놀면 잠든다. 깨는 데 30~60초라, 일요일 아침에 처음 누른 사람이
   * 그걸 다 기다리게 된다. 앱이 입력 화면을 열 때 여기를 한 번 찔러서 미리 깨운다.
   * 사진을 고르는 동안 일어나 있으므로 분석을 누를 때는 이미 준비돼 있다.
   */
  if (path === '/health') {
    send(res, {
      ok: true,
      auth: authConfigured(),
      key: Boolean(process.env.ANTHROPIC_API_KEY),
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    });
    return;
  }

  const handler = ROUTES[path];
  if (!handler) return send(res, { error: `그런 주소가 없습니다: ${path}` }, 404);
  if (req.method !== 'POST') return send(res, { error: 'POST만 지원합니다.' }, 405);

  const auth = await requireUser(req.headers.authorization);
  if (!auth.ok) return send(res, { error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await readJson(req);
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      return send(res, { error: '사진이 너무 큽니다. 한 장씩 나눠서 올려 주세요.' }, 413);
    }
    return send(res, { error: '요청 본문이 JSON이 아닙니다.' }, 400);
  }

  try {
    const reply = await handler(body as never);
    send(res, reply.body, reply.status);
  } catch (error) {
    // 핸들러가 터져도 서버는 살아 있어야 한다. 이유는 로그에 남긴다.
    console.error('처리 중 예외', error);
    send(res, { error: '서버에서 처리하지 못했습니다.' }, 500);
  }
});

/*
 * 사진을 읽는 요청은 길다. 기본값(약 2분)으로 두면 다 읽기 전에 소켓이 끊긴다 —
 * 옮겨 온 이유가 시간 제한이었는데 여기서 다시 걸리면 헛일이다.
 */
server.requestTimeout = 300_000;
server.headersTimeout = 310_000;

server.listen(PORT, () => {
  console.log(`AI 프록시가 ${PORT} 에서 듣고 있습니다.`);
  if (!authConfigured()) {
    console.error('경고: SUPABASE_URL / SUPABASE_ANON_KEY 가 없어 모든 요청을 막습니다.');
  }
  if (!process.env.ANTHROPIC_API_KEY) console.error('경고: ANTHROPIC_API_KEY 가 없습니다.');
});
