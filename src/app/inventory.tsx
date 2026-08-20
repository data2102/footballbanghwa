import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useStore } from '@/lib/store';
import { uid } from '@/lib/format';
import { shareMessage, shareText } from '@/lib/share';
import {
  Button,
  Card,
  Divider,
  Empty,
  Row,
  Screen,
  SectionHeader,
  Stepper,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * 물품 재고.
 *
 * 조끼·공·콘처럼 매주 들고 나가는 것들이다. 알고 싶은 건 "몇 개 남았나" 하나뿐이라
 * 구매일·단가·보관처 같은 칸을 두지 않았다 — 칸이 늘면 아무도 안 채우고,
 * 반쯤 빈 표는 없는 것만 못하다.
 *
 * 수량은 숫자를 치는 게 아니라 눌러서 올린다. 창고 앞에서 세면서 누르는 자리다.
 */
const MAX_QUANTITY = 99;

export default function InventoryScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);
  const saveInventory = useStore((state) => state.saveInventory);
  const removeInventory = useStore((state) => state.removeInventory);

  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  if (!data) return null;
  const items = [...data.inventory].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  const total = items.reduce((sum, item) => sum + item.quantity, 0);

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveInventory({ id: uid(), name: trimmed, quantity: 1, note: null });
    setName('');
  }

  return (
    <Screen>
      <Card>
        <Row justify="space-between">
          <Txt variant="h3">품목 {items.length}가지</Txt>
          <Txt variant="h3" tabular muted>
            모두 {total}개
          </Txt>
        </Row>
        <Txt variant="tiny" muted>
          경기 끝나고 챙길 때 그 자리에서 눌러 두면 다음 주에 뭘 사야 하는지가 보여요.
        </Txt>
      </Card>

      <SectionHeader title="가진 것" />
      <Card style={{ padding: space.sm, gap: 0 }}>
        {items.length === 0 ? (
          <Empty text={'아직 적어 둔 물품이 없어요.\n조끼부터 하나 넣어 보세요.'} />
        ) : (
          items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <Row justify="space-between" style={{ padding: space.sm }}>
                <View style={{ flexShrink: 1 }}>
                  <Txt variant="body">{item.name}</Txt>
                  {item.note ? (
                    <Txt variant="tiny" muted numberOfLines={1}>
                      {item.note}
                    </Txt>
                  ) : null}
                </View>
                <Row gap={space.sm}>
                  <Stepper
                    value={item.quantity}
                    max={MAX_QUANTITY}
                    suffix="개"
                    onChange={(next) => saveInventory({ ...item, quantity: next })}
                    accessibilityLabel={`${item.name} 수량`}
                  />
                  <Button
                    label="빼기"
                    tone="danger"
                    small
                    onPress={() => removeInventory(item.id)}
                  />
                </Row>
              </Row>
            </View>
          ))
        )}
      </Card>

      <SectionHeader title="새로 넣기" />
      <Card>
        <TextInput
          value={name}
          onChangeText={setName}
          onSubmitEditing={add}
          returnKeyType="done"
          placeholder="예) 조끼(주황), 경기구, 라바콘"
          placeholderTextColor={p.textFaint}
          style={{
            backgroundColor: p.surface,
            borderColor: p.borderStrong,
            borderWidth: 1,
            borderRadius: radius.sm,
            paddingHorizontal: space.md,
            paddingVertical: space.md,
            color: p.text,
            fontSize: 15,
          }}
        />
        <Row gap={space.sm}>
          <Button
            label="단톡방에 보내기"
            icon="message"
            tone="neutral"
            style={{ flex: 1 }}
            disabled={items.length === 0}
            onPress={async () =>
              setNotice(
                shareMessage(
                  await shareText(
                    [
                      `${data.team.name} 물품 현황`,
                      ...items.map((item) => `${item.name} ${item.quantity}개`),
                    ].join('\n'),
                    '물품 현황',
                  ),
                ),
              )
            }
          />
          <Button label="품목 넣기" style={{ flex: 1 }} disabled={!name.trim()} onPress={add} />
        </Row>
      </Card>

      {notice ? (
        <Txt variant="small" color={p.ok} style={{ textAlign: 'center' }}>
          {notice}
        </Txt>
      ) : (
        <View />
      )}
    </Screen>
  );
}
