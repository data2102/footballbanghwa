import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useStore } from '@/lib/store';
import { composeMessage } from '@/lib/ai/compose';
import { isLocalRepo } from '@/lib/repo';
import { duesForPeriod, focusMatch, tallyAttendance } from '@/lib/selectors';
import { fillTemplate, orderTemplates, slotValues, unfilledSlots } from '@/lib/templates';
import { formatDate, formatPeriod, thisPeriod, won } from '@/lib/format';
import { shareMessage, shareText } from '@/lib/share';
import {
  Button,
  Card,
  Chip,
  Divider,
  Row,
  Screen,
  SectionHeader,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * 공지 만들기.
 *
 * 총무가 매주 쓰는 공지는 사실 서너 종류뿐이고, 안에 들어가는 숫자만 바뀐다.
 * 그래서 틀을 고르면 앱이 아는 값(다음 경기, 참석 인원, 미납 인원)을 채운 초안이 나온다.
 *
 * 초안은 항상 고칠 수 있다. AI 는 다듬기만 하고, 보내는 건 사람이 누른다 —
 * 단톡방에 나가는 글이라 되돌릴 수가 없다.
 */
type Template = 'match' | 'dues' | 'rules' | 'canceled' | 'free';

const TEMPLATES: { value: Template; label: string }[] = [
  { value: 'match', label: '경기 공지' },
  { value: 'dues', label: '회비 안내' },
  { value: 'rules', label: '회칙 안내' },
  { value: 'canceled', label: '우천 취소' },
  { value: 'free', label: '빈 공지' },
];

export default function NoticeScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);

  const [template, setTemplate] = useState<Template>('match');
  const [draft, setDraft] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const touchTemplate = useStore((state) => state.touchTemplate);
  // 저장해 둔 문구는 틀보다 앞에 둔다. 총무가 실제로 매주 쓰는 글이 이쪽이다.
  const savedTemplates = useMemo(
    () => (data ? orderTemplates(data.templates, 'notice') : []),
    [data?.templates],
  );

  const built = useMemo(() => (data ? build(template, data) : ''), [template, data]);
  // 손대기 전까지는 틀을 바꾸면 초안도 따라 바뀐다. 손댄 뒤에는 덮어쓰지 않는다.
  const text = touched ? draft : built;

  if (!data) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Card>
          <Txt variant="h3">어떤 공지인가요?</Txt>
          <Row wrap gap={space.sm}>
            {TEMPLATES.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={template === option.value}
                onPress={() => {
                  setTemplate(option.value);
                  setTouched(false);
                  setNotice(null);
                }}
              />
            ))}
          </Row>
          <Txt variant="tiny" muted>
            틀을 고르면 앱이 아는 날짜와 인원으로 초안을 채워요. 아래에서 고칠 수 있어요.
          </Txt>

          {savedTemplates.length ? (
            <>
              <Divider />
              <Txt variant="h3">저장해 둔 문구</Txt>
              <Row wrap gap={space.sm}>
                {savedTemplates.map((row) => (
                  <Chip
                    key={row.id}
                    label={row.title}
                    onPress={() => {
                      const filled = fillTemplate(row.body, slotValues(data));
                      const missing = unfilledSlots(filled);
                      setDraft(filled);
                      setTouched(true);
                      setNotice(
                        missing.length
                          ? `${missing.map((key) => `{${key}}`).join(', ')} 는 지금 채울 값이 없어요.`
                          : null,
                      );
                      void touchTemplate(row.id);
                    }}
                  />
                ))}
              </Row>
              <Txt variant="tiny" muted>
                더보기 &gt; 문구 보관함에서 고치고 새로 만들 수 있어요.
              </Txt>
            </>
          ) : null}
        </Card>

        <SectionHeader title="초안" />
        <TextInput
          multiline
          value={text}
          onChangeText={(next) => {
            setDraft(next);
            setTouched(true);
            setNotice(null);
          }}
          placeholder="공지를 적어 보세요."
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
            minHeight: 240,
            textAlignVertical: 'top',
          }}
        />

        <Row gap={space.sm}>
          <Button
            label="AI로 다듬기"
            tone="neutral"
            style={{ flex: 1 }}
            loading={busy}
            disabled={!text.trim()}
            onPress={async () => {
              setBusy(true);
              setError(null);
              setNotice(null);
              try {
                const polished = await composeMessage({
                  kind: 'notice',
                  teamName: data.team.name,
                  includeNames: true,
                  draft: text,
                });
                setDraft(polished);
                setTouched(true);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : '문구를 다듬지 못했어요.');
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            label="단톡방에 보내기"
            icon="message"
            style={{ flex: 1 }}
            disabled={!text.trim()}
            onPress={async () => setNotice(shareMessage(await shareText(text, '공지')))}
          />
        </Row>

        <Txt variant="tiny" muted>
          다듬어도 날짜·금액·인원은 그대로 둬요. 나온 글은 다시 고칠 수 있고, 보내는 건 눌러야 나가요.
          {isLocalRepo ? ' 데모 모드에서는 초안이 그대로 나와요.' : ''}
        </Txt>

        {notice ? (
          <Txt variant="small" color={p.ok} style={{ textAlign: 'center' }}>
            {notice}
          </Txt>
        ) : null}
        {error ? (
          <Txt variant="small" color={p.danger} style={{ textAlign: 'center' }}>
            {error}
          </Txt>
        ) : null}
        <View />
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** 앱이 아는 값으로 초안을 채운다. 모르는 건 비워 두고 사람이 적게 한다. */
function build(template: Template, data: NonNullable<ReturnType<typeof useStore.getState>['data']>): string {
  const match = focusMatch(data.matches);
  const when = match ? `${formatDate(match.date)} ${match.kickoff}` : '';
  const period = thisPeriod();

  if (template === 'match') {
    if (!match) return '';
    const tally = tallyAttendance(data, match.id);
    return [
      `${data.team.name} 경기 공지드려요.`,
      `${when} · ${match.venue}`,
      match.opponent ? `상대는 ${match.opponent}예요.` : null,
      `지금까지 ${tally.attending + tally.late}명 참석이에요.`,
      tally.unknown ? `${tally.unknown}명은 아직 투표를 안 하셨어요. 참석 여부만 남겨 주세요.` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (template === 'dues') {
    const dues = duesForPeriod(data, period);
    const unpaid = dues.filter((row) => row.outstanding > 0);
    const total = unpaid.reduce((sum, row) => sum + row.outstanding, 0);
    return [
      `${formatPeriod(period)} 회비 안내드려요.`,
      `월 회비는 ${won(data.team.monthlyDue)}, 연납은 ${won(data.team.annualDue)}이에요.`,
      unpaid.length
        ? `아직 ${unpaid.length}명이 안 내셨어요. 남은 금액은 모두 ${won(total)}이에요.`
        : '이번 달은 전원 완납이에요. 고맙습니다.',
      '계좌는 공지 참고해 주세요.',
    ].join('\n');
  }

  if (template === 'rules') {
    return [
      `${data.team.name} 회칙 공유드려요.`,
      '',
      data.team.rules ?? '(회칙을 아직 안 적었어요. 더보기 → 회칙에서 적어 두면 여기 들어와요.)',
    ].join('\n');
  }

  if (template === 'canceled') {
    return [
      `${data.team.name} 오늘 경기 취소 안내드려요.`,
      when ? `${when} 경기예요.` : null,
      '비가 와서 구장을 쓸 수 없게 됐어요.',
      '다음 주 같은 시간에 뵐게요.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return '';
}
