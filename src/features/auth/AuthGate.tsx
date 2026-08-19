import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Button, Card, Row, Screen, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * 이메일 OTP 로그인.
 * 매직링크 대신 6자리 코드를 쓴다. 딥링크 설정 없이 웹·iOS·Android에서 똑같이 동작한다.
 */
export function AuthGate() {
  const p = usePalette();
  const load = useStore((state) => state.load);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = {
    backgroundColor: p.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: p.text,
    fontSize: 16,
  };

  async function send() {
    if (!supabase || !email.includes('@')) return;
    setBusy(true);
    setError(null);
    const { error: caught } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (caught) setError(caught.message);
    else setSent(true);
    setBusy(false);
  }

  async function verify() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: caught } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    if (caught) setError(caught.message);
    else await load();
    setBusy(false);
  }

  return (
    <Screen>
      <View style={{ height: space.xxl }} />
      <Txt variant="h1">우리팀 매니저</Txt>
      <Txt variant="small" muted>
        조기축구 감독·코치·총무를 위한 운영 도구입니다. 이메일로 로그인하세요.
      </Txt>

      <Card>
        <Txt variant="tiny" muted>
          이메일
        </Txt>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={p.textMuted}
          editable={!sent}
          style={input}
        />
        {sent ? (
          <>
            <Txt variant="tiny" muted>
              메일로 받은 6자리 코드
            </Txt>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              placeholder="000000"
              placeholderTextColor={p.textMuted}
              style={input}
            />
            <Row gap={space.sm}>
              <Button
                label="이메일 수정"
                tone="neutral"
                style={{ flex: 1 }}
                onPress={() => {
                  setSent(false);
                  setCode('');
                }}
              />
              <Button label="로그인" style={{ flex: 2 }} loading={busy} onPress={verify} />
            </Row>
          </>
        ) : (
          <Button label="인증코드 받기" loading={busy} onPress={send} />
        )}
        {error ? (
          <Txt variant="small" color={p.danger}>
            {error}
          </Txt>
        ) : null}
      </Card>
    </Screen>
  );
}
