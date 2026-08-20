import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { fillTemplate, orderTemplates, slotValues, unfilledSlots } from '@/lib/templates';
import { shareMessage, shareText } from '@/lib/share';
import { Button, Card, Divider, Row, Txt, space } from '@/components/ui';
import { usePalette } from '@/theme';
import type { Match, MessageTemplateKind } from '@/lib/types';

/**
 * 저장해 둔 초안을 고르고 그 자리에서 단톡방으로 보낸다.
 *
 * 매주 같은 글을 보내는 사람에게 가장 짧은 길이다 — 고르고, 보낸다. 두 번이면 끝난다.
 * 문구를 새로 짓거나 AI 를 부르는 건 상황이 특별할 때뿐이라 아래(문구 만들기)로 내렸다.
 *
 * 날짜·인원은 저장된 자리({날짜})가 꺼낼 때마다 이번 주 값으로 채워진다.
 * 그래서 지난주에 쓴 글을 그대로 눌러도 이번 주 내용이 나간다.
 */
export function SavedDrafts({ kind, match }: { kind: MessageTemplateKind; match?: Match | null }) {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);
  const touchTemplate = useStore((state) => state.touchTemplate);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!data) return null;
  const rows = orderTemplates(data.templates, kind);

  if (rows.length === 0) {
    return (
      <Card>
        <Txt variant="h3">자주 쓰는 글을 초안으로 넣어 두세요</Txt>
        <Txt variant="tiny" muted>
          한 번 적어 두면 다음부터는 고르고 보내기만 하면 돼요. 날짜와 인원은 그때그때 채워져요.
        </Txt>
        <Button
          label="초안 만들러 가기"
          tone="neutral"
          onPress={() => router.push('/templates')}
        />
      </Card>
    );
  }

  return (
    <Card style={{ padding: space.sm, gap: 0 }}>
      {rows.map((row, index) => {
        const filled = fillTemplate(row.body, slotValues(data, match));
        const missing = unfilledSlots(filled);
        return (
          <View key={row.id}>
            {index > 0 ? <Divider /> : null}
            <View style={{ padding: space.sm, gap: space.sm }}>
              <Row justify="space-between">
                <View style={{ flexShrink: 1 }}>
                  <Txt variant="h3">{row.title}</Txt>
                  <Txt variant="tiny" muted numberOfLines={2}>
                    {filled}
                  </Txt>
                </View>
                <Button
                  label="보내기"
                  icon="message"
                  small
                  tone="neutral"
                  disabled={busyId === row.id}
                  onPress={async () => {
                    setBusyId(row.id);
                    try {
                      setNotice(shareMessage(await shareText(filled)));
                      void touchTemplate(row.id);
                    } finally {
                      setBusyId(null);
                    }
                  }}
                />
              </Row>
              {/*
                채울 값이 없는 자리는 지우지 않고 남긴다. 그대로 나가면 단톡방에
                {날짜} 가 찍히므로, 보내기 전에 눈에 띄게 해 둔다.
              */}
              {missing.length ? (
                <Txt variant="tiny" color={p.warn}>
                  {missing.map((key) => `{${key}}`).join(', ')} 를 아직 못 채웠어요. 고치고 보내세요.
                </Txt>
              ) : null}
            </View>
          </View>
        );
      })}

      {notice ? (
        <Txt variant="small" color={p.ok} style={{ padding: space.sm }}>
          {notice}
        </Txt>
      ) : null}
    </Card>
  );
}
