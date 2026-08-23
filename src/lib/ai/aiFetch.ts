import { supabase } from '@/lib/supabase';

/**
 * AI 서버(Render)를 부르는 한 자리.
 *
 * 전에는 Supabase Edge Function 이었다. 옮긴 이유는 실행 시간 한도(150초) 하나다 —
 * 아흔 명 명단을 읽는 요청이 그 벽에 붙어서, 요청을 나누고 출력을 줄여도
 * WORKER_RESOURCE_LIMIT 으로 계속 죽었다.
 *
 * 옮기면서 우리가 떠안은 몫이 인증이다. Edge Function 은 "로그인한 사람인지"를
 * 공짜로 검사해 줬다. 이제는 우리가 토큰을 실어 보내고 서버가 Supabase 에 물어본다.
 * 이게 없으면 주소만 아는 사람이 우리 Anthropic 키로 요청을 날린다.
 */
const AI_URL = (process.env.EXPO_PUBLIC_AI_URL ?? '').replace(/\/$/, '');

export const aiConfigured = Boolean(AI_URL);

/** supabase-js 의 실패 모양을 흉내 낸다. invokeError 가 본문을 읽어 이유를 꺼낼 수 있게. */
function httpError(response: Response): Error {
  const error = new Error('AI 서버가 2xx 가 아닌 상태로 답했어요.');
  (error as Error & { context?: Response }).context = response;
  return error;
}

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * 무료 플랜은 15분 놀면 잠들고, 깨는 데 30~60초가 걸린다.
 * 일요일 아침에 처음 누른 사람이 그걸 다 기다리지 않도록 미리 한 번 찔러 둔다.
 * 실패해도 조용히 넘어간다 — 깨우기는 곁다리라 화면에 오류를 띄울 일이 아니다.
 */
/** 마지막으로 찌른 시각. 탭을 오갈 때마다 부르므로 짧은 사이에 두 번 가지 않게 막는다. */
let wokeAt = 0;
const WAKE_EVERY_MS = 60_000;

export function wakeAiServer(): void {
  if (!AI_URL) return;
  const now = Date.now();
  if (now - wokeAt < WAKE_EVERY_MS) return;
  wokeAt = now;
  void fetch(`${AI_URL}/health`, { method: 'GET' }).catch(() => {});
}

export async function callAi<T>(path: string, body: unknown): Promise<T> {
  if (!AI_URL) {
    throw new Error(
      'AI 서버 주소가 없어요. 저장소 Secrets 에 EXPO_PUBLIC_AI_URL 을 넣고 다시 배포해 주세요.',
    );
  }

  const token = await accessToken();
  if (!token) throw new Error('로그인이 풀렸어요. 다시 로그인해 주세요.');

  const response = await fetch(`${AI_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  // 본문은 읽지 않고 넘긴다. invokeError 가 한 번만 읽어서 이유를 꺼낸다.
  if (!response.ok) throw httpError(response);
  return (await response.json()) as T;
}
