import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useStore } from '@/lib/store';
import { shareMessage, shareText } from '@/lib/share';
import { Button, Card, Empty, Row, Screen, Txt, radius, space } from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * 회칙.
 *
 * 단톡방에 새 사람이 들어올 때마다 회칙을 다시 찾아서 붙여넣게 된다.
 * 여기 한 벌 두고 필요할 때 그대로 내보낸다. 형태는 팀마다 너무 달라서
 * 항목으로 쪼개지 않고 자유 문장으로 둔다.
 */
export default function RulesScreen() {
  const p = usePalette();
  const team = useStore((state) => state.data?.team);
  const updateTeam = useStore((state) => state.updateTeam);

  const [draft, setDraft] = useState(team?.rules ?? '');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 다른 기기에서 고친 게 들어오면 따라간다. 편집 중일 때는 건드리지 않는다.
  useEffect(() => {
    if (!editing) setDraft(team?.rules ?? '');
  }, [team?.rules, editing]);

  if (!team) return null;
  const saved = team.rules ?? '';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        {editing ? (
          <>
            <TextInput
              multiline
              autoFocus
              value={draft}
              onChangeText={setDraft}
              placeholder={'예)\n1. 회비는 매달 5일까지 냅니다.\n2. 경기 시작 10분 전까지 옵니다.\n3. 불참은 토요일까지 알려 주세요.'}
              placeholderTextColor={p.textFaint}
              style={{
                backgroundColor: p.surface,
                borderColor: p.border,
                borderWidth: 1,
                borderRadius: radius.lg,
                padding: space.lg,
                color: p.text,
                fontSize: 15,
                lineHeight: 26,
                minHeight: 320,
                textAlignVertical: 'top',
              }}
            />
            <Row gap={space.sm}>
              <Button
                label="그만두기"
                tone="neutral"
                style={{ flex: 1 }}
                onPress={() => {
                  setDraft(saved);
                  setEditing(false);
                }}
              />
              <Button
                label="저장하기"
                style={{ flex: 1 }}
                onPress={async () => {
                  await updateTeam({ rules: draft.trim() || null });
                  setEditing(false);
                  setNotice('저장했어요.');
                }}
              />
            </Row>
          </>
        ) : (
          <>
            <Card>
              {saved ? (
                <Txt variant="body" style={{ lineHeight: 26 }}>
                  {saved}
                </Txt>
              ) : (
                <Empty text={'아직 회칙을 안 적었어요.\n새로 들어온 사람에게 보낼 한 벌을 만들어 두세요.'} />
              )}
            </Card>

            <Row gap={space.sm}>
              <Button
                label={saved ? '고치기' : '회칙 적기'}
                tone="neutral"
                style={{ flex: 1 }}
                onPress={() => setEditing(true)}
              />
              <Button
                label="단톡방에 보내기"
                icon="message"
                style={{ flex: 1 }}
                disabled={!saved}
                onPress={async () => setNotice(shareMessage(await shareText(saved, `${team.name} 회칙`)))}
              />
            </Row>
          </>
        )}

        {notice ? (
          <Txt variant="small" color={p.ok} style={{ textAlign: 'center' }}>
            {notice}
          </Txt>
        ) : (
          <View />
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
