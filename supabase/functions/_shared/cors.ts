/** 모바일 웹(브라우저)에서 직접 호출하므로 CORS 프리플라이트를 처리해야 한다. */
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  /*
   * 2xx 가 아니면 이유를 로그에 남긴다. supabase-js 가 클라이언트에서 응답 본문을
   * 버리기 때문에, 대시보드 로그가 무슨 일이 있었는지 볼 수 있는 유일한 자리다.
   * 실제로 400 하나를 놓고 원인을 못 찾아 몇 번을 왕복했다.
   */
  if (status >= 400) {
    const reason = (body as { error?: string })?.error ?? JSON.stringify(body);
    console.error(`[${status}] ${reason}`);
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
