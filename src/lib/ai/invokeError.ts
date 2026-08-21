/**
 * Edge Function 이 실패했을 때 진짜 이유를 꺼낸다.
 *
 * supabase-js 는 2xx 가 아니면 "Edge Function returned a non-2xx status code" 하나만
 * 남기고 응답 본문을 버린다. 함수는 "ANTHROPIC_API_KEY 시크릿이 설정되지 않았습니다"
 * 처럼 무엇을 해야 하는지 적어 보내는데, 그게 화면까지 오지 않는다.
 *
 * 실제로 운동장에서 이걸 봤다 — 사진을 올렸는데 붉은 띠에 영어 한 줄만 뜨고,
 * 무엇을 고쳐야 하는지 알 길이 없었다. 본문을 직접 읽어서 그 말을 되살린다.
 *
 * **친절한 문장과 원문을 둘 다 들고 다닌다.** 친절한 쪽만 남기면 화면은 읽기 좋아지지만
 * 고치는 사람이 볼 게 없어진다. 사진 분석이 안 되는 걸 네 번 고쳤는데 네 번 다
 * 원인을 못 보고 짐작으로 고쳤다 — 그 사이 사용자는 같은 실패를 네 번 봤다.
 * 원문은 화면에서 "자세히"로 접어 두고, 필요할 때 통째로 복사할 수 있게 한다.
 */
type WithContext = { context?: unknown; message?: string };

/** 어느 판이 올라가 있는지. 배포가 반영됐는지부터 갈려야 그다음을 물어볼 수 있다. */
export const BUILD_ID = process.env.EXPO_PUBLIC_BUILD ?? 'dev';

export type InvokeFailure = {
  /** 화면에 크게 보여 줄 말. 무슨 일 + 어떻게. */
  message: string;
  /** 접어 두는 원문. 상태 코드·응답 본문·어느 판인지. */
  detail: string;
};

function guidance(status: number, body: string): string | null {
  if (status === 404) {
    return 'AI 함수가 아직 서버에 올라가 있지 않아요. 함수를 고친 커밋을 push 하면 자동으로 올라가요.';
  }
  if (status === 401 || status === 403) {
    return 'AI 함수를 부를 권한이 없어요. 로그아웃했다가 다시 로그인해 보세요.';
  }
  if (status === 413 || /too large|payload|body size/i.test(body)) {
    return '사진이 너무 커요. 한 장씩 올리거나 화면을 잘라서 다시 찍어 주세요.';
  }
  if (/ANTHROPIC_API_KEY/i.test(body)) {
    return 'AI 키가 서버에 없어요. Supabase 시크릿에 ANTHROPIC_API_KEY 를 넣어 주세요.';
  }
  /*
   * Edge Function 이 실행 한도(시간·메모리)를 넘겨 죽었을 때 오는 코드다.
   * 워커가 죽으면 우리가 적어 보낸 이유가 아무것도 안 남으므로 여기서 말해 준다.
   */
  if (/WORKER_RESOURCE_LIMIT|WORKER_LIMIT|resource limit|compute resources/i.test(body)) {
    return '서버가 시간 안에 다 못 읽고 끊겼어요. 아래 "자세히"를 눌러 내용을 복사해 보내 주세요.';
  }
  if (status === 504 || /timeout/i.test(body)) {
    return '분석이 시간 안에 안 끝났어요. 사진을 한 장씩 나눠서 올려 보세요.';
  }
  return null;
}

export async function describeInvokeError(
  error: unknown,
  fallback: string,
): Promise<InvokeFailure> {
  const context = (error as WithContext)?.context;
  const message = (error as WithContext)?.message ?? '';
  const stamp = `앱 ${BUILD_ID}`;

  // context 가 Response 면 본문에 함수가 적어 보낸 이유가 들어 있다.
  if (context && typeof (context as Response).text === 'function') {
    const response = context as Response;
    let body = '';
    try {
      body = await response.text();
    } catch {
      // 본문을 못 읽어도 상태 코드만으로 안내할 수 있다.
    }

    let short = body;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      if (parsed?.error) short = parsed.error;
    } catch {
      // JSON 이 아니면 본문을 그대로 쓴다.
    }

    const detail = [`HTTP ${response.status}`, stamp, body.slice(0, 800) || '(본문 없음)'].join(
      '\n',
    );
    const hint = guidance(response.status, body);
    if (hint) return { message: hint, detail };
    if (short) return { message: `AI 분석에 실패했어요. (${short.slice(0, 160)})`, detail };
    return { message: `AI 분석에 실패했어요. 서버가 ${response.status} 로 답했어요.`, detail };
  }

  const detail = [stamp, message || '(메시지 없음)'].join('\n');
  if (/failed to fetch|network/i.test(message)) {
    return { message: '서버에 닿지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.', detail };
  }
  return { message: message || fallback, detail };
}

/** 원문이 필요 없는 자리(문구 만들기 등)를 위한 얇은 껍데기. */
export async function explainInvokeError(error: unknown, fallback: string): Promise<string> {
  return (await describeInvokeError(error, fallback)).message;
}

/** 화면까지 원문을 들고 가려고 Error 에 붙여 둔다. */
export function failureToError(failure: InvokeFailure): Error {
  const error = new Error(failure.message);
  (error as Error & { detail?: string }).detail = failure.detail;
  return error;
}

export function detailOf(error: unknown): string | null {
  const detail = (error as { detail?: unknown })?.detail;
  return typeof detail === 'string' && detail ? detail : null;
}
