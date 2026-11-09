import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { authRedirectUrl } from '@/lib/links';
import { isRealEmail, loginEmail, loginIdProblem } from '@/lib/loginId';
import { useStore } from '@/lib/store';
import { Button, Card, Divider, Row, Screen, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * Supabase 가 돌려주는 영어 오류를 무슨 일인지 + 어떻게 하면 되는지로 바꾼다.
 * raw 문자열을 그대로 띄우면 사용자는 다음에 뭘 해야 할지 알 수 없다.
 */
function explain(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return '아이디나 비밀번호가 맞지 않아요. 처음이시면 아래에서 계정을 만들어 주세요.';
  }
  if (lower.includes('email not confirmed')) {
    return '메일 확인이 아직 안 됐어요. 받은 메일의 링크를 한 번 눌러 주세요.';
  }
  if (lower.includes('password should be at least') || lower.includes('password is too short')) {
    return '비밀번호가 너무 짧아요. 여섯 자 이상으로 정해 주세요.';
  }
  if (lower.includes('already registered') || lower.includes('already exists')) {
    return '이미 있는 아이디예요. 다른 아이디를 정하거나, 내 아이디면 로그인해 주세요.';
  }
  if (lower.includes('email') && lower.includes('invalid')) {
    // 아이디를 바꾼 내부 주소를 Supabase 가 받아 주지 않을 때. 사람이 고칠 수 있는 게 없다.
    return '이 아이디로는 계정을 만들 수 없어요. 운영진에게 알려 주세요.';
  }
  if (lower.includes('rate limit')) {
    return '너무 자주 시도했어요. 잠시 뒤에 다시 해 주세요.';
  }
  if (lower.includes('invalid') && lower.includes('token')) {
    return '코드가 맞지 않아요. 가장 최근에 온 메일의 코드인지 확인해 주세요.';
  }
  if (lower.includes('redirect') || lower.includes('not allowed')) {
    return '돌아올 주소가 Supabase 에 등록돼 있지 않아요. Authentication > URL Configuration 의 Redirect URLs 를 확인해 주세요.';
  }
  if (lower.includes('expired')) {
    return '코드가 만료됐어요. 다시 받아 주세요.';
  }
  if (lower.includes('signups not allowed') || lower.includes('signup is disabled')) {
    return '이 프로젝트는 새 가입을 막아 뒀어요. Supabase 의 Authentication 설정을 확인해 주세요.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return '서버에 닿지 못했어요. 인터넷 연결과 Supabase 주소를 확인해 주세요.';
  }
  return `로그인하지 못했어요. (${message})`;
}

type Mode = 'password' | 'signup' | 'link';

const TITLE: Record<Mode, string> = {
  password: '로그인하기',
  signup: '계정 만들기',
  link: '로그인 메일 받기',
};

/**
 * 로그인.
 *
 * 기본은 **아이디 + 비밀번호**다(`lib/loginId.ts`). 회원은 메일을 열어 볼 일이 없고,
 * 단톡방에서 아이디·비번으로 주고받는 게 익숙하다. 칸에 `@` 가 있으면 예전처럼 이메일로 본다.
 *
 * 비밀번호 방식은 메일이 오기를 기다리지 않아도 되고, 확인하러 다른 앱으로
 * 넘어갔다 돌아올 필요도 없다. 폰에서 매주 여는 앱이라 이 차이가 크다.
 *
 * 메일 링크 방식도 남겨 뒀다. 비밀번호를 잊었을 때 들어올 길이 그것뿐이라
 * 지우면 갇히는 사람이 생긴다.
 */
export function AuthGate() {
  const p = usePalette();
  const load = useStore((state) => state.load);
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  // 칸 이름은 email 이지만 아이디가 들어온다. Supabase 에 넘길 때만 이메일로 바꾼다.
  const target = loginEmail(email);
  const idProblem = loginIdProblem(email);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const input = {
    backgroundColor: p.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: p.text,
    fontSize: 16,
  };

  // 메일 링크는 진짜 이메일에만 보낼 수 있다. 아이디의 내부 주소에는 받을 사람이 없다.
  const validEmail = mode === 'link' ? isRealEmail(email) && target !== null : target !== null;

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setSent(false);
    setCode('');
  }

  async function signIn() {
    if (!supabase || !target || !password) return;
    setBusy(true);
    setError(null);
    const { error: caught } = await supabase.auth.signInWithPassword({
      email: target,
      password,
    });
    if (caught) setError(explain(caught.message));
    else await load();
    setBusy(false);
  }

  async function signUp() {
    if (!supabase || !target || !password) return;
    setBusy(true);
    setError(null);
    const { data, error: caught } = await supabase.auth.signUp({
      email: target,
      password,
      options: { emailRedirectTo: authRedirectUrl() },
    });
    if (caught) {
      setError(explain(caught.message));
    } else if (data.session) {
      // 메일 확인이 꺼져 있으면 그 자리에서 바로 들어간다.
      await load();
    } else if (!isRealEmail(email)) {
      /*
       * 아이디로 만들었는데 세션이 안 왔다 = Supabase 의 Confirm email 이 켜져 있다.
       * 받을 수 없는 메일을 기다리게 두지 말고, 고칠 사람에게 무엇을 할지 말한다.
       */
      setError(
        '계정은 만들었지만 바로 들어오지 못했어요. Supabase 에서 이메일 확인(Confirm email)을 꺼야 아이디로 쓸 수 있어요. 운영진에게 알려 주세요.',
      );
    } else {
      /*
       * 메일 확인이 켜져 있으면 세션이 안 온다. 여기서 아무 말도 안 하면
       * 버튼을 눌렀는데 아무 일도 안 일어난 것처럼 보인다.
       */
      setNotice('확인 메일을 보냈어요. 링크를 한 번 누르면 이 비밀번호로 로그인할 수 있어요.');
    }
    setBusy(false);
  }

  async function sendLink() {
    if (!supabase || !validEmail) return;
    setBusy(true);
    setError(null);
    const { error: caught } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: authRedirectUrl() },
    });
    if (caught) setError(explain(caught.message));
    else setSent(true);
    setBusy(false);
  }

  async function verifyCode() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: caught } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (caught) setError(explain(caught.message));
    else await load();
    setBusy(false);
  }

  return (
    <Screen>
      <View style={{ height: space.xxl }} />
      <Txt variant="h1">우리팀 매니저</Txt>
      <Txt variant="small" muted>
        조기축구 감독·코치·총무를 위한 운영 도구입니다.
      </Txt>

      <Card>
        <Txt variant="tiny" muted>
          {mode === 'link' ? '이메일' : '아이디'}
        </Txt>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={mode === 'link' ? 'email-address' : 'default'}
          textContentType="username"
          autoComplete="username"
          placeholder={mode === 'link' ? 'you@example.com' : mode === 'signup' ? '영문·숫자 3~20자' : '아이디'}
          placeholderTextColor={p.textFaint}
          editable={!sent}
          style={input}
        />
        {mode !== 'link' && idProblem ? (
          <Txt variant="tiny" color={p.danger}>
            {idProblem}
          </Txt>
        ) : null}
        {mode === 'link' && email.trim() && !isRealEmail(email) ? (
          <Txt variant="tiny" color={p.danger}>
            메일 링크는 이메일로 가입한 분만 쓸 수 있어요.
          </Txt>
        ) : null}

        {mode === 'link' ? null : (
          <>
            <Txt variant="tiny" muted>
              비밀번호
            </Txt>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              placeholder={mode === 'signup' ? '여섯 자 이상' : '••••••••'}
              placeholderTextColor={p.textFaint}
              style={input}
              onSubmitEditing={mode === 'signup' ? signUp : signIn}
            />
          </>
        )}

        {mode === 'link' && sent ? (
          <>
            <Txt variant="small">메일을 보냈어요.</Txt>
            <Txt variant="tiny" muted>
              메일 안의 링크를 누르면 그대로 로그인돼요. 옮겨 적을 게 없어요.
            </Txt>
            <Txt variant="tiny" muted>
              코드가 함께 왔다면 아래에 넣어도 돼요.
            </Txt>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="000000"
              placeholderTextColor={p.textFaint}
              style={input}
            />
            <Row gap={space.sm}>
              <Button
                label="이메일 고치기"
                tone="neutral"
                style={{ flex: 1 }}
                onPress={() => {
                  setSent(false);
                  setCode('');
                }}
              />
              <Button
                label="코드로 로그인"
                style={{ flex: 2 }}
                disabled={code.trim().length < 6}
                loading={busy}
                onPress={verifyCode}
              />
            </Row>
          </>
        ) : (
          /* 화면당 채운 파란 버튼은 하나. 지금 고른 방식의 버튼만 파랗다. */
          <Button
            label={TITLE[mode]}
            loading={busy}
            disabled={!validEmail || (mode !== 'link' && password.length === 0)}
            onPress={mode === 'signup' ? signUp : mode === 'link' ? sendLink : signIn}
          />
        )}

        {notice ? (
          <Txt variant="small" color={p.ok}>
            {notice}
          </Txt>
        ) : null}
        {error ? (
          <Txt variant="small" color={p.danger}>
            {error}
          </Txt>
        ) : null}
      </Card>

      <Card style={{ gap: space.sm }}>
        {mode !== 'password' ? (
          <Button label="비밀번호로 로그인" tone="neutral" onPress={() => switchTo('password')} />
        ) : null}
        {mode !== 'signup' ? (
          <Button label="계정 새로 만들기" tone="neutral" onPress={() => switchTo('signup')} />
        ) : null}
        {mode !== 'link' ? (
          <>
            <Divider />
            <Txt variant="tiny" muted>
              비밀번호를 잊었으면 운영진에게 새 비밀번호를 받아 주세요. 예전에 이메일로
              가입한 분은 메일 링크로도 들어올 수 있어요.
            </Txt>
            <Button label="이메일로 로그인 메일 받기" tone="neutral" onPress={() => switchTo('link')} />
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
