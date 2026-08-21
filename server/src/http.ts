import type { ServerResponse } from 'node:http';

/**
 * 브라우저에서 바로 부르는 서버라 CORS 를 직접 처리해야 한다.
 * Edge Function 은 이걸 공짜로 해 줬다 — 옮기면서 우리가 떠안는 몫이다.
 */
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

export function send(res: ServerResponse, body: unknown, status = 200): void {
  /*
   * 2xx 가 아니면 이유를 로그에 남긴다. 화면에는 친절한 문장만 가는데,
   * 무엇이 잘못됐는지 볼 자리가 한 군데는 있어야 한다.
   */
  if (status >= 400) {
    const reason = (body as { error?: string })?.error ?? JSON.stringify(body);
    console.error(`[${status}] ${reason}`);
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** 본문이 클 수 있다(사진 base64). 한도를 넘으면 읽다 말고 끊는다. */
export const MAX_BODY_BYTES = 12 * 1024 * 1024;

export class BodyTooLarge extends Error {}

export async function readJson(req: NodeJS.ReadableStream & { destroy: () => void }): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      req.destroy();
      throw new BodyTooLarge('본문이 너무 큽니다.');
    }
    chunks.push(buf);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
