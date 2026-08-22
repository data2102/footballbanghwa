import { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { lineupImage, lineupText, type LineupShareInput } from '@/features/lineup/lineupShare';
import { shareImage, shareMessage, shareText } from '@/lib/share';
import { Button, Card, Row, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * 라인업을 단톡방으로 내보낸다.
 *
 * 조기축구에서 라인업이 실제로 도는 곳은 카카오톡이다. 앱 안에서만 보이면
 * 총무가 결국 손으로 옮겨 적게 되고, 그러면 앱을 쓸 이유가 없어진다.
 *
 * 이미지는 웹에서만 만든다(네이티브에는 canvas 가 없다). 글은 어디서나 되고
 * 검색도 되므로, 이미지가 안 되는 자리에서는 글이 대신 나간다.
 */
export function ShareLineup(props: LineupShareInput) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'image' | 'text' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filled = props.slots.filter((slot) => slot.memberId || slot.guestName).length;
  const text = lineupText(props);
  const canImage = Platform.OS === 'web';

  async function sendImage() {
    setBusy('image');
    setNotice(null);
    try {
      const url = await lineupImage(props, p);
      if (!url) {
        // 이미지를 못 만드는 자리에서는 조용히 글로 대신한다. 실패로 보이면 안 된다.
        setNotice(shareMessage(await shareText(text, '라인업')));
        return;
      }
      const day = props.match.date.replaceAll('-', '');
      const outcome = await shareImage(url, `lineup-${day}.png`, text);
      setNotice(
        outcome === 'failed'
          ? shareMessage(await shareText(text, '라인업'))
          : shareMessage(outcome),
      );
    } finally {
      setBusy(null);
    }
  }

  async function sendText() {
    setBusy('text');
    setNotice(null);
    try {
      setNotice(shareMessage(await shareText(text, '라인업')));
    } finally {
      setBusy(null);
    }
  }

  if (filled === 0) return null;

  if (!open) {
    return (
      <Button
        label="단톡방에 보내기"
        icon="message"
        tone="neutral"
        onPress={() => setOpen(true)}
      />
    );
  }

  return (
    <Card>
      <Txt variant="h3">단톡방에 보낼 라인업</Txt>

      <Row gap={space.sm}>
        {canImage ? (
          <Button
            label="그림으로 보내기"
            icon="image"
            tone="neutral"
            small
            style={{ flex: 1 }}
            loading={busy === 'image'}
            onPress={sendImage}
          />
        ) : null}
        <Button
          label="글로 보내기"
          icon="message"
          tone="neutral"
          small
          style={{ flex: 1 }}
          loading={busy === 'text'}
          onPress={sendText}
        />
      </Row>

      {/* 나가는 내용을 미리 보여 준다. 고치고 싶으면 여기서 바로 골라 복사할 수 있다. */}
      <TextInput
        multiline
        editable={false}
        value={text}
        style={{
          backgroundColor: p.surfaceAlt,
          borderRadius: radius.sm,
          padding: space.md,
          color: p.textMuted,
          fontSize: 14,
          lineHeight: 22,
          minHeight: 132,
          textAlignVertical: 'top',
        }}
      />

      {notice ? (
        <Txt variant="small" color={p.ok}>
          {notice}
        </Txt>
      ) : null}

      {!canImage ? (
        <Txt variant="tiny" muted>
          앱에서는 글로만 보내요. 그림으로 보내려면 웹에서 열어 주세요.
        </Txt>
      ) : null}

      <View style={{ alignItems: 'center' }}>
        <Button label="닫기" tone="neutral" small onPress={() => setOpen(false)} />
      </View>
    </Card>
  );
}
