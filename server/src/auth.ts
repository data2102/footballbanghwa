/**
 * 로그인한 팀원인지 확인한다.
 *
 * **Edge Function 은 이걸 공짜로 해 줬다.** 다른 데로 옮기면서 직접 만들어야 하는 게
 * 이것이고, 안 만들면 주소만 아는 사람이 우리 Anthropic 키로 요청을 날린다.
 * CLAUDE.md 에 "옮기게 되면 인증부터 설계한다"고 적어 둔 게 이 자리다.
 *
 * 토큰을 직접 뜯지 않고 Supabase 에 물어본다. 프로젝트마다 서명 방식이 달라서
 * (HS256 / 비대칭) 직접 검증하면 조용히 틀릴 수 있는데, 물어보면 틀릴 일이 없다.
 * AI 호출이 어차피 몇 초라 여기 붙는 수십 밀리초는 문제가 안 된다.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

/** 같은 사람이 사진 여러 장을 동시에 올리면 물어보기가 장수만큼 늘어난다. 짧게 기억해 둔다. */
const CACHE_MS = 60_000;
const seen = new Map<string, { userId: string; at: number }>();

export function authConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function requireUser(authorization: string | undefined): Promise<AuthResult> {
  if (!authConfigured()) {
    /*
     * 설정이 빠진 채로 열어 두면 안 된다. 인증 없이 도는 AI 프록시는
     * 주소만 알면 누구나 쓰는 공짜 창구가 된다.
     */
    return { ok: false, status: 500, error: '서버에 SUPABASE_URL / SUPABASE_ANON_KEY 가 없습니다.' };
  }

  const token = (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, status: 401, error: '로그인이 필요합니다.' };

  const hit = seen.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ok: true, userId: hit.userId };

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, status: 503, error: '로그인 확인 서버에 닿지 못했습니다.' };
  }

  if (!response.ok) return { ok: false, status: 401, error: '로그인이 만료됐습니다. 다시 로그인해 주세요.' };

  const user = (await response.json()) as { id?: string };
  if (!user?.id) return { ok: false, status: 401, error: '로그인이 필요합니다.' };

  seen.set(token, { userId: user.id, at: Date.now() });
  // 오래된 것은 흘려보낸다. 안 그러면 토큰이 쌓이기만 한다.
  if (seen.size > 500) {
    for (const [key, value] of seen) if (Date.now() - value.at > CACHE_MS) seen.delete(key);
  }
  return { ok: true, userId: user.id };
}
