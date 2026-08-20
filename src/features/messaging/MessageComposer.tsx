import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { composeMessage, type ComposeOptions } from '@/lib/ai/compose';
import { isLocalRepo } from '@/lib/repo';
import { useStore } from '@/lib/store';
import { shareMessage, shareText } from '@/lib/share';
import { fillTemplate, orderTemplates, slotValues, unfilledSlots } from '@/lib/templates';
import { uid } from '@/lib/format';
import { Button, Card, Chip, Divider, Row, Toggle, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';
import type { Match, MessageTemplateKind } from '@/lib/types';

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
  templateKind,
  match,
}: {
  openLabel: string;
  title: string;
  namesOnHelp: string;
  namesOffHelp: string;
  notePlaceholder: string;
  /** 지금 화면 상태를 문구 요청으로 바꾼다. 토글과 덧붙일 말은 여기서 받아 넣는다. */
  build: (options: { includeNames: boolean; note?: string }) => ComposeOptions;
  /** 저장해 둔 문구 중 어떤 종류를 꺼내 쓸지. 없으면 문구 보관함을 안 보여 준다. */
  templateKind?: MessageTemplateKind;
  /** 자리를 채울 기준 경기. 없으면 다음 경기를 본다. */
  match?: Match | null;
}) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [includeNames, setIncludeNames] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const data = useStore((state) => state.data);
  const touchTemplate = useStore((state) => state.touchTemplate);
  const saveTemplate = useStore((state) => state.saveTemplate);
  const saved = templateKind && data ? orderTemplates(data.templates, templateKind) : [];

  /** 저장해 둔 문구를 꺼낸다. 자리는 그 주 값으로 채워서 넣는다. */
  function useTemplate(id: string, body: string) {
    if (!data) return;
    const filled = fillTemplate(body, slotValues(data, match));
    const missing = unfilledSlots(filled);
    setMessage(filled);
    setError(null);
    setNotice(
      missing.length
        ? `${missing.map((key) => `{${key}}`).join(', ')} 는 지금 채울 값이 없어요. 직접 고쳐 주세요.`
        : null,
    );
    void touchTemplate(id);
  }

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

      {/*
        저장해 둔 문구가 있으면 AI 를 부르기 전에 먼저 보여 준다.
        매주 같은 글을 쓰는 사람에게는 이쪽이 훨씬 빠르다 — 누르면 바로 글이 나온다.
      */}
      {saved.length ? (
        <>
          <Txt variant="tiny" muted>
            저장해 둔 문구
          </Txt>
          <Row wrap gap={space.sm}>
            {saved.map((template) => (
              <Chip
                key={template.id}
                label={template.title}
                onPress={() => useTemplate(template.id, template.body)}
              />
            ))}
          </Row>
          <Divider />
        </>
      ) : null}

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
          {/*
            지금 글을 다음에도 쓰게 저장해 둔다. 날짜·인원은 이미 채워진 값이라
            그대로 저장하면 다음 주에 안 맞는다 — 문구 보관함에서 자리로 바꿔 두면 된다.
          */}
          {templateKind ? (
            <Button
              label="이 문구 저장해 두기"
              tone="neutral"
              small
              onPress={async () => {
                await saveTemplate({
                  id: uid(),
                  title: `${title} ${new Date().toISOString().slice(5, 10)}`,
                  body: message,
                  kind: templateKind,
                  usedAt: null,
                });
                setNotice('저장했어요. 더보기 > 문구 보관함에서 이름과 자리를 고칠 수 있어요.');
              }}
            />
          ) : null}
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
