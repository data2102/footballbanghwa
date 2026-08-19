import { useState } from 'react';
import { TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { composeMessage, type ComposeKind } from '@/lib/ai/compose';
import { isLocalRepo } from '@/lib/repo';
import { formatPeriod } from '@/lib/format';
import { Button, Card, Divider, Row, Toggle, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';
import type { DueStatus } from '@/lib/selectors';

/**
 * 미납자에게 보낼 안내 문구를 만든다.
 *
 * 총무가 매달 같은 문장을 새로 고민하는 일을 없애는 게 목적이라, 만든 문구는
 * 반드시 고칠 수 있어야 한다. AI 가 쓴 그대로 나가는 경로는 두지 않는다.
 */
export function ReminderComposer({
  teamName,
  period,
  monthlyDue,
  unpaid,
}: {
  teamName: string;
  period: string;
  monthlyDue: number;
  unpaid: DueStatus[];
}) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [includeNames, setIncludeNames] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate(kind: ComposeKind) {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const text = await composeMessage({
        kind,
        teamName,
        period,
        monthlyDue,
        unpaid: unpaid.map((row) => ({ name: row.member.name, amount: row.outstanding })),
        includeNames,
        note: note.trim() || undefined,
      });
      setMessage(text);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '문구를 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  if (unpaid.length === 0) {
    return (
      <Card>
        <Txt variant="small" color={p.ok}>
          {formatPeriod(period)} 회비는 다 걷혔어요. 보낼 안내가 없어요.
        </Txt>
      </Card>
    );
  }

  if (!open) {
    return (
      <Button
        label={`미납 ${unpaid.length}명에게 보낼 문구 만들기`}
        icon="message"
        tone="neutral"
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <Card>
      <Txt variant="h3">단톡방에 붙여넣을 안내 문구</Txt>

      <Toggle
        label="이름 넣기"
        help={
          includeNames
            ? '누가 안 냈는지 단톡방에 그대로 보여요.'
            : '인원수만 적어요. 공개적으로 이름이 도는 게 부담스러울 때.'
        }
        value={includeNames}
        onChange={(next) => {
          setIncludeNames(next);
          setMessage(null);
        }}
      />

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="덧붙일 말 (예: 이번 주까지 부탁드려요)"
        placeholderTextColor={p.textFaint}
        style={{
          backgroundColor: p.surfaceAlt,
          borderRadius: radius.sm,
          paddingHorizontal: space.md,
          paddingVertical: space.md,
          color: p.text,
          fontSize: 15,
        }}
      />

      {message ? (
        <>
          <Divider />
          {/* 나온 문구는 그대로 고칠 수 있다. 보내는 사람은 총무지 AI 가 아니다. */}
          <TextInput
            multiline
            value={message}
            onChangeText={(next) => {
              setMessage(next);
              setCopied(false);
            }}
            style={{
              backgroundColor: p.surfaceAlt,
              borderRadius: radius.sm,
              padding: space.md,
              color: p.text,
              fontSize: 15,
              lineHeight: 24,
              minHeight: 150,
              textAlignVertical: 'top',
            }}
          />
          <Row gap={space.sm}>
            <Button
              label="다시 만들기"
              tone="neutral"
              small
              style={{ flex: 1 }}
              loading={busy}
              onPress={() => generate('dues_reminder')}
            />
            <Button
              label={copied ? '복사했어요' : '복사하기'}
              small
              style={{ flex: 1 }}
              onPress={async () => {
                await Clipboard.setStringAsync(message);
                setCopied(true);
              }}
            />
          </Row>
        </>
      ) : (
        <Button label="문구 만들기" loading={busy} onPress={() => generate('dues_reminder')} />
      )}

      {error ? (
        <Txt variant="small" color={p.danger}>
          {error}
        </Txt>
      ) : null}

      {isLocalRepo ? (
        <Txt variant="tiny" muted>
          데모 모드에서는 정해진 틀로 만들어요. Supabase를 연결하면 Claude가 상황에 맞춰 씁니다.
        </Txt>
      ) : null}

      <View style={{ alignItems: 'center' }}>
        <Button label="닫기" tone="neutral" small onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}
