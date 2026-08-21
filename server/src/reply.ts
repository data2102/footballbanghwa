/**
 * 핸들러는 Response 를 만들지 않고 "무엇을 몇 번으로 답할지"만 돌려준다.
 * HTTP 껍데기(CORS·헤더·로그)는 index.ts 한 곳에서만 붙인다.
 *
 * Edge Function 시절의 json() 과 이름·모양을 맞춰 뒀다. 그래야 옮겨 온 코드를
 * 손대지 않고 그대로 쓸 수 있다 — 읽는 규칙을 다시 타자하면 반드시 어긋난다.
 */
export type Reply = { status: number; body: unknown };

export function json(body: unknown, status = 200): Reply {
  return { body, status };
}
