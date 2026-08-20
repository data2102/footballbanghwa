import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useStore } from '@/lib/store';
import { uid } from '@/lib/format';
import {
  KIND_LABEL,
  fillTemplate,
  orderTemplates,
  slotValues,
  slotsFor,
  unfilledSlots,
} from '@/lib/templates';
import { shareMessage, shareText } from '@/lib/share';
import {
  Button,
  Card,
  Chip,
  Divider,
  Empty,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { usePalette } from '@/theme';
import type { MessageTemplateKind } from '@/lib/types';

/**
 * 문구 보관함.
 *
 * 총무가 단톡방에 쓰는 글은 서너 종류뿐이고 매주 숫자만 바뀐다. 그래서 문장을
 * 통째로 저장하면 "매번 쓰기 귀찮다"가 안 풀린다 — 결국 날짜와 인원을 매번 고친다.
 *
 * 본문에 `{날짜}` 같은 자리를 두면 꺼낼 때마다 앱이 그 주 값으로 채운다.
 * 자리를 외우게 하지 않으려고, 편집 중에는 넣을 수 있는 자리를 눌러서 넣게 했다.
 */
const KINDS: MessageTemplateKind[] = ['attendance', 'dues', 'notice'];

export default function TemplatesScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);
  const saveTemplate = useStore((state) => state.saveTemplate);
  const removeTemplate = useStore((state) => state.removeTemplate);

  const [kind, setKind] = useState<MessageTemplateKind>('attendance');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const values = useMemo(() => (data ? slotValues(data) : {}), [data]);

  if (!data) return null;
  const rows = orderTemplates(data.templates, kind);
  const editing = editingId ? data.templates.find((row) => row.id === editingId) : null;

  function startNew() {
    setEditingId('new');
    setTitle('');
    setBody('');
    setNotice(null);
  }

  function startEdit(id: string) {
    const found = data!.templates.find((row) => row.id === id);
    if (!found) return;
    setEditingId(id);
    setTitle(found.title);
    setBody(found.body);
    setNotice(null);
  }

  async function save() {
    if (!title.trim() || !body.trim()) return;
    await saveTemplate({
      id: editingId && editingId !== 'new' ? editingId : uid(),
      title: title.trim(),
      body: body.trim(),
      kind: editing?.kind ?? kind,
      usedAt: editing?.usedAt ?? null,
    });
    setEditingId(null);
    setNotice('저장했어요.');
  }

  // 편집 중에는 지금 쓴 본문이 실제로 어떻게 나가는지 바로 보여 준다.
  const preview = body ? fillTemplate(body, values) : '';
  const missing = preview ? unfilledSlots(preview) : [];

  if (editingId) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen>
          <Card>
            <Txt variant="tiny" muted>
              이름
            </Txt>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="예) 주중 참석 독촉"
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
          </Card>

          <SectionHeader title="본문" />
          <TextInput
            multiline
            value={body}
            onChangeText={setBody}
            placeholder={'{날짜} {시간} 경기 있어요.\n아직 답 안 주신 분: {미투표명단}'}
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
              minHeight: 180,
              textAlignVertical: 'top',
            }}
          />

          {/* 자리를 외우게 하지 않는다. 눌러서 넣는다. */}
          <Card>
            <Txt variant="h3">넣을 수 있는 자리</Txt>
            <Txt variant="tiny" muted>
              누르면 본문 끝에 붙어요. 꺼낼 때마다 그 주 값으로 바뀝니다.
            </Txt>
            <Row wrap gap={space.sm}>
              {slotsFor(editing?.kind ?? kind).map((slot) => (
                <Chip
                  key={slot.key}
                  label={`{${slot.key}}`}
                  // 이어 누르면 {날짜}{장소} 처럼 붙는다. 앞이 공백이 아니면 한 칸 띄운다.
                  onPress={() =>
                    setBody((prev) =>
                      `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}{${slot.key}}`,
                    )
                  }
                />
              ))}
            </Row>
          </Card>

          {preview ? (
            <>
              <SectionHeader title="이렇게 나가요" />
              <Card>
                <Txt variant="body" style={{ lineHeight: 26 }}>
                  {preview}
                </Txt>
                {missing.length ? (
                  <Txt variant="tiny" color={p.warn}>
                    {missing.map((key) => `{${key}}`).join(', ')} 는 지금 채울 값이 없어요.
                    경기가 정해지면 채워집니다.
                  </Txt>
                ) : null}
              </Card>
            </>
          ) : null}

          <Row gap={space.sm}>
            <Button
              label="그만두기"
              tone="neutral"
              style={{ flex: 1 }}
              onPress={() => setEditingId(null)}
            />
            <Button
              label="저장하기"
              style={{ flex: 1 }}
              disabled={!title.trim() || !body.trim()}
              onPress={save}
            />
          </Row>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  return (
    <Screen>
      <Card>
        <Txt variant="h3">매주 쓰는 글은 한 번만 적어 두세요</Txt>
        <Txt variant="tiny" muted>
          {'{날짜}'} {'{미투표명단}'} 같은 자리를 넣어 두면 꺼낼 때마다 그 주 값으로 채워져요.
          참석·회비 화면에서 바로 꺼내 쓸 수 있어요.
        </Txt>
      </Card>

      <Segmented
        value={kind}
        onChange={setKind}
        options={KINDS.map((value) => ({ value, label: KIND_LABEL[value] }))}
      />

      <Card style={{ padding: space.sm, gap: 0 }}>
        {rows.length === 0 ? (
          <Empty text={'아직 저장해 둔 문구가 없어요.\n자주 쓰는 글을 하나 적어 두세요.'} />
        ) : (
          rows.map((row, index) => {
            const filled = fillTemplate(row.body, values);
            return (
              <View key={row.id}>
                {index > 0 ? <Divider /> : null}
                <View style={{ padding: space.sm, gap: space.sm }}>
                  <Txt variant="h3">{row.title}</Txt>
                  <Txt variant="tiny" muted numberOfLines={3}>
                    {filled}
                  </Txt>
                  <Row gap={space.sm}>
                    <Button
                      label="고치기"
                      tone="neutral"
                      small
                      style={{ flex: 1 }}
                      onPress={() => startEdit(row.id)}
                    />
                    <Button
                      label="보내기"
                      icon="message"
                      tone="neutral"
                      small
                      style={{ flex: 1 }}
                      onPress={async () => setNotice(shareMessage(await shareText(filled)))}
                    />
                    <Button
                      label="지우기"
                      tone="danger"
                      small
                      onPress={() => removeTemplate(row.id)}
                    />
                  </Row>
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Button label="문구 새로 적기" icon="plus" onPress={startNew} />

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
