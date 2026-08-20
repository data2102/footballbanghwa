/**
 * Edge Function 이 실패했을 때 진짜 이유를 꺼낸다.
 *
 * supabase-js 는 2xx 가 아니면 "Edge Function returned a non-2xx status code" 하나만
 * 남기고 응답 본문을 버린다. 함수는 "ANTHROPIC_API_KEY 시크릿이 설정되지 않았습니다"
 * 처럼 무엇을 해야 하는지 적어 보내는데, 그게 화면까지 오지 않는다.
 *
 * 실제로 운동장에서 이걸 봤다 — 사진을 올렸는데 붉은 띠에 영어 한 줄만 뜨고,
 * 무엇을 고쳐야 하는지 알 길이 없었다. 본문을 직접 읽어서 그 말을 되살린다.
 */
type WithContext = { context?: unknown; message?: string };

function guidance(status: number, body: string): string | null {
  if (status === 404) {
    return 'AI 함수가 아직 서버에 올라가 있지 않아요. 맥북에서 npm run fn:deploy 를 한 번 해 주세요.';
  }
  if (status === 401 || status === 403) {
    return 'AI 함수를 부를 권한이 없어요. 로그아웃했다가 다시 로그인해 보세요.';
  }
  if (status === 413 || /too large|payload/i.test(body)) {
    return '사진이 너무 커요. 한 장씩 올리거나 화면을 잘라서 다시 찍어 주세요.';
  }
  if (/ANTHROPIC_API_KEY/i.test(body)) {
    return 'AI 키가 서버에 없어요. 맥북에서 npx supabase secrets set ANTHROPIC_API_KEY=... 를 한 번 해 주세요.';
  }
  if (status === 504 || /timeout/i.test(body)) {
    return '분석이 시간 안에 안 끝났어요. 사진을 한 장씩 나눠서 올려 보세요.';
  }
  return null;
}

export async function explainInvokeError(error: unknown, fallback: string): Promise<string> {
  const context = (error as WithContext)?.context;
  const message = (error as WithContext)?.message ?? '';

  // context 가 Response 면 본문에 함수가 적어 보낸 이유가 들어 있다.
  if (context && typeof (context as Response).text === 'function') {
    const response = context as Response;
    let body = '';
    try {
      body = await response.text();
    } catch {
      // 본문을 못 읽어도 상태 코드만으로 안내할 수 있다.
    }

    let detail = body;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed?.error) detail = parsed.error;
    } catch {
      // JSON 이 아니면 본문을 그대로 쓴다.
    }

    const hint = guidance(response.status, body);
    if (hint) return hint;
    if (detail) return `AI 분석에 실패했어요. (${detail.slice(0, 200)})`;
    return `AI 분석에 실패했어요. 서버가 ${response.status} 로 답했어요.`;
  }

  if (/failed to fetch|network/i.test(message)) {
    return '서버에 닿지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.';
  }
  return message || fallback;
}
