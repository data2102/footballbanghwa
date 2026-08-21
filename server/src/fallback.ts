/**
 * 안전 분류기가 요청을 거절했을 때 서버가 알아서 다른 모델로 넘기는 옵션.
 *
 * **아무 모델에나 붙이면 안 된다.** Opus 5 · Fable 5 쪽만 받는다.
 * Sonnet 5 에 붙였다가 400 으로 전부 실패했다:
 *
 *   'claude-sonnet-5' does not support the `fallbacks` parameter.
 *
 * 읽는 모델은 ANTHROPIC_MODEL 시크릿으로 바꿀 수 있으므로, 고정으로 붙이지 않고
 * 그때 쓰는 모델을 보고 정한다. Opus 로 되돌리면 이 옵션도 같이 돌아온다.
 */
const SUPPORTS_FALLBACK = /^claude-(opus-5|opus-4-8|opus-4-7|fable-5|mythos-5)\b/;

export function fallbackOptions(model: string): {
  betas?: string[];
  fallbacks?: 'default';
} {
  if (!SUPPORTS_FALLBACK.test(model)) return {};
  return { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
}
