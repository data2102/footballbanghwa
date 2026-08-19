import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Button, Card, Row, Screen, Segmented, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';

/** 로그인은 했지만 아직 소속 팀이 없을 때. 팀을 만들거나 초대코드로 들어간다. */
export function TeamGate() {
  const p = usePalette();
  const load = useStore((state) => state.load);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [myName, setMyName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [due, setDue] = useState('30000');
  const [inviteCode, setInviteCode] = useState('');
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

  async function submit() {
    if (!supabase || !myName.trim()) return;
    setBusy(true);
    setError(null);
    const { error: caught } =
      mode === 'create'
        ? await supabase.rpc('create_team', {
            p_name: teamName.trim(),
            p_monthly_due: Number(due.replace(/\D/g, '')) || 0,
            p_my_name: myName.trim(),
          })
        : await supabase.rpc('join_team', {
            p_invite_code: inviteCode.trim().toUpperCase(),
            p_my_name: myName.trim(),
          });
    if (caught) setError(caught.message);
    else await load();
    setBusy(false);
  }

  return (
    <Screen>
      <View style={{ height: space.xl }} />
      <Txt variant="h1">팀 연결</Txt>
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: '새 팀 만들기' },
          { value: 'join', label: '초대코드로 참여' },
        ]}
      />

      <Card>
        <Txt variant="tiny" muted>
          내 이름 (명단에 표시됩니다)
        </Txt>
        <TextInput value={myName} onChangeText={setMyName} placeholder="홍길동" placeholderTextColor={p.textMuted} style={input} />

        {mode === 'create' ? (
          <>
            <Txt variant="tiny" muted>
              팀 이름
            </Txt>
            <TextInput value={teamName} onChangeText={setTeamName} placeholder="방화 FC" placeholderTextColor={p.textMuted} style={input} />
            <Txt variant="tiny" muted>
              월 회비 (원)
            </Txt>
            <TextInput value={due} onChangeText={setDue} keyboardType="number-pad" style={input} />
          </>
        ) : (
          <>
            <Txt variant="tiny" muted>
              초대코드 6자리
            </Txt>
            <TextInput
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              placeholder="ABC123"
              placeholderTextColor={p.textMuted}
              style={input}
            />
          </>
        )}

        <Button
          label={mode === 'create' ? '팀 만들기' : '팀 참여하기'}
          loading={busy}
          disabled={!myName.trim() || (mode === 'create' ? !teamName.trim() : inviteCode.trim().length < 4)}
          onPress={submit}
        />
        {error ? (
          <Txt variant="small" color={p.danger}>
            {error}
          </Txt>
        ) : null}
      </Card>

      <Row justify="center">
        <Button label="로그아웃" tone="neutral" small onPress={() => supabase?.auth.signOut().then(load)} />
      </Row>
    </Screen>
  );
}
