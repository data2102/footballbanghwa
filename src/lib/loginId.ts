/**
 * 아이디 로그인.
 *
 * Supabase Auth 는 이메일(또는 전화번호)로만 계정을 만든다. 그런데 조기축구 회원은
 * 메일을 열어 볼 일이 없고, 단톡방에서 "아이디 limpard, 비번 ..." 으로 주고받는 게 익숙하다.
 * 그래서 아이디를 **실제로는 안 쓰는 내부 이메일**로 바꿔 Supabase 에 넘긴다.
 *
 *   limpard  →  limpard@id.footballbanghwa.app
 *
 * - 이 주소로 메일이 갈 일은 없다. 그래서 Supabase 의 **Confirm email 을 꺼 둬야** 한다.
 *   켜 두면 가입하자마자 받을 수 없는 확인 메일을 기다리게 된다.
 * - 비밀번호를 잊으면 메일로 되찾을 수 없다. 운영진이 Supabase 대시보드
 *   (Authentication > Users) 에서 바꿔 준다.
 * - `@` 가 들어 있으면 예전처럼 이메일로 본다. 이메일로 가입해 둔 사람이 갇히지 않게.
 *
 * **도메인을 바꾸지 않는다.** 바꾸는 순간 지금까지 만든 아이디가 전부 다른 계정이 된다.
 */
export const LOGIN_ID_DOMAIN = 'id.footballbanghwa.app';

/** 영문 소문자·숫자·`.`·`_`·`-`, 3~20자. 첫 글자는 영문이나 숫자. */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,19}$/;

/** 입력값을 Supabase 에 넘길 이메일로. 쓸 수 없는 값이면 null. */
export function loginEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('@')) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : null;
  return ID_PATTERN.test(value) ? `${value}@${LOGIN_ID_DOMAIN}` : null;
}

/** 이메일로 들어온 값인지. 메일 링크·확인 메일은 이쪽만 쓸 수 있다. */
export function isRealEmail(raw: string): boolean {
  return raw.trim().includes('@');
}

/** 로그인한 계정의 이메일을 화면에 보일 이름으로. 내부 주소면 아이디만 남긴다. */
export function displayLoginId(email: string | null | undefined): string | null {
  if (!email) return null;
  const suffix = `@${LOGIN_ID_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

/** 아이디 칸 아래에 띄울 한 줄. 문제가 없으면 null. */
export function loginIdProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.includes('@')) return null;
  if (/[A-Z]/.test(value) && ID_PATTERN.test(value.toLowerCase())) return null;
  if (value.length < 3) return '아이디는 세 글자 이상이에요.';
  if (value.length > 20) return '아이디는 스무 글자까지예요.';
  if (!ID_PATTERN.test(value.toLowerCase())) return '아이디는 영문·숫자·. _ - 만 쓸 수 있어요.';
  return null;
}
