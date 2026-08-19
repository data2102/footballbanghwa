import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { composeMessage, type ComposeOptions } from '@/lib/ai/compose';
import { isLocalRepo } from '@/lib/repo';
import { shareMessage, shareText } from '@/lib/share';
import { Button, Card, Divider, Row, Toggle, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * 단톡방에 붙여넣을 문구를 만드는 공용 껍데기.
 *
 * 회비 독촉이든 참석 독촉이든 총무가 하는 일은 같다 — 매번 같은 문장을 새로 고민하고,
 * 이름을 넣을지 말지 망설이고, 결국 조금 고쳐서 보낸다. 그래서 만든 문구는 반드시
 * 고칠 수 있어야 한다. AI 가 쓴 그대로 나가는 경로는 두지 않는다.
 */
export function MessageComposer({
  openLabel,
  title,
  namesOnHelp,
  namesOffHelp,
  notePlaceholder,
  build,
}: {
  openLabel: string;
  title: string;
  namesOnHelp: string;
  namesOffHelp: string;
  notePlaceholder: string;
  /** 지금 화면 상태를 문구 요청으로 바꾼다. 토글과 덧붙일 말은 여기서 받아 넣는다. */
  build: (options: { includeNames: boolean; note?: string }) => ComposeOptions;
}) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [includeNames, setIncludeNames] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setMessage(await composeMessage(build({ includeNames, note: note.trim() || undefined })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '문구를 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <Button label={openLabel} icon="message" tone="neutral" onPress={() => setOpen(true)} />;
  }

  return (
    <Card>
      <Txt variant="h3">{title}</Txt>

      <Toggle
        label="이름 넣기"
        help={includeNames ? namesOnHelp : namesOffHelp}
        value={includeNames}
        onChange={(next) => {
          setIncludeNames(next);
          setMessage(null);
        }}
      />

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={notePlaceholder}
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
              setNotice(null);
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
              onPress={generate}
            />
            <Button
              label="보내기"
              small
              style={{ flex: 1 }}
              onPress={async () => setNotice(shareMessage(await shareText(message)))}
            />
          </Row>
        </>
      ) : (
        <Button label="문구 만들기" loading={busy} onPress={generate} />
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
