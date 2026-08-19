import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { parseText } from '@/lib/ai/client';
import { isLocalRepo } from '@/lib/repo';
import { findFormation, normalizeFormationId } from '@/features/lineup/formations';
import { formatDate, todayISO, won } from '@/lib/format';
import { availableMembers } from '@/lib/selectors';
import {
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  Row,
  Screen,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { usePalette } from '@/theme';
import type { ParseIntent, ParseResponse, ParsedItem } from '@/lib/ai/contract';
import type { AttendanceStatus, LineupSlot, PositionGroup } from '@/lib/types';

type Hint = Exclude<ParseIntent, 'mixed' | 'unknown'>;

const HINTS: { value: Hint | 'auto'; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'attendance', label: '참석' },
  { value: 'payment', label: '회비' },
  { value: 'lineup', label: '라인업' },
  { value: 'event', label: '기록' },
];

const EXAMPLES: Record<Hint, string> = {
  attendance: '이번주 일요일 조기축구\n병준이형 ㅇ\n도현 참석\n성우 불참(출장)\n민석 30분 늦게 감\n우진 ㅇ\n재영 못가요',
  payment: '[Web발신]\n08/19 09:12 입금 30,000 이도현\n잔액 1,240,000\n\n박성우 8월 회비 3만 보냈어요\n구장비 12만원 결제',
  lineup: '오늘 4-3-3으로 간다\n골키퍼 병준이형\n수비 도현 성우 민석 우진\n중원 재영 세훈 현수\n공격 태윤 상혁 지호',
  event: '전반 12분 태윤이 골, 지호 어시\n후반 10분 상혁 골\n병준이형 선방 세 번',
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  attending: '참석',
  absent: '불참',
  late: '지각',
  unknown: '미정',
};

const EVENT_LABEL: Record<string, string> = {
  goal: '골',
  assist: '도움',
  save: '선방',
  yellow: '경고',
  red: '퇴장',
  own_goal: '자책골',
};

export default function QuickInputScreen() {
  const p = usePalette();
  const router = useRouter();
  const params = useLocalSearchParams<{ hint?: string }>();

  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const setAttendance = useStore((state) => state.setAttendance);
  const addLedger = useStore((state) => state.addLedger);
  const addEvent = useStore((state) => state.addEvent);
  const saveLineup = useStore((state) => state.saveLineup);
  const addMember = useStore((state) => state.addMember);

  const [hint, setHint] = useState<Hint | 'auto'>((params.hint as Hint) ?? 'auto');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  /** 사용자가 체크한 항목 인덱스. AI가 사람을 특정하지 못한 항목은 기본 해제. */
  const [checked, setChecked] = useState<Set<number>>(new Set());
  /** AI가 못 찾은 사람을 사용자가 직접 고른 결과. */
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  const activeMembers = useMemo(
    () => (data?.members ?? []).filter((member) => member.active),
    [data?.members],
  );

  if (!data) return null;
  const match = data.matches.find((item) => item.id === activeMatchId) ?? null;

  function memberIdOf(item: ParsedItem, index: number): string | null {
    return overrides[index] ?? item.memberId;
  }

  async function runParse() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await parseText({
        text,
        members: activeMembers,
        team: data!.team,
        hint: hint === 'auto' ? undefined : hint,
      });
      setResult(response);
      setChecked(
        new Set(response.items.map((item, index) => (item.memberId ? index : -1)).filter((i) => i >= 0)),
      );
      setOverrides({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '분석에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!result) return;
    setBusy(true);
    try {
      const selected = result.items
        .map((item, index) => ({ item, index }))
        .filter(({ index }) => checked.has(index));

      const lineupItems: { item: ParsedItem; memberId: string }[] = [];

      for (const { item, index } of selected) {
        const memberId = memberIdOf(item, index);
        if (!memberId && item.kind !== 'payment') continue;

        if (item.kind === 'attendance' && match) {
          await setAttendance(match.id, memberId!, item.status, { note: item.note, source: 'ai' });
        } else if (item.kind === 'payment') {
          await addLedger({
            memberId: item.ledgerKind === 'expense' ? memberId : memberId,
            kind: item.ledgerKind,
            amount: item.amount,
            period: item.ledgerKind === 'due' ? item.period : null,
            occurredOn: item.occurredOn ?? todayISO(),
            memo: item.memo,
            source: 'ai',
          });
        } else if (item.kind === 'event' && match) {
          await addEvent({ matchId: match.id, memberId: memberId!, type: item.type, minute: item.minute });
        } else if (item.kind === 'lineup') {
          lineupItems.push({ item, memberId: memberId! });
        }
      }

      if (lineupItems.length && match) {
        const existing = data!.lineups.find((row) => row.matchId === match.id);
        const formationId =
          normalizeFormationId(result.formation) ?? existing?.formationId ?? '4-3-3';
        const formation = findFormation(formationId);
        const slots: LineupSlot[] = formation.slots.map((slot) => ({ ...slot, memberId: null }));

        // slotKey가 있으면 그 자리에, 없으면 같은 그룹의 빈 자리에 순서대로 넣는다.
        for (const { item, memberId } of lineupItems) {
          if (item.kind !== 'lineup') continue;
          const byKey = item.slotKey ? slots.find((slot) => slot.key === item.slotKey) : undefined;
          const target =
            byKey && !byKey.memberId
              ? byKey
              : slots.find((slot) => slot.group === (item.group as PositionGroup) && !slot.memberId);
          if (target) target.memberId = memberId;
        }

        const assigned = new Set(slots.map((slot) => slot.memberId).filter(Boolean) as string[]);
        await saveLineup({
          matchId: match.id,
          formationId,
          slots,
          benchMemberIds: availableMembers(data!, match.id)
            .filter((member) => !assigned.has(member.id))
            .map((member) => member.id),
        });
      }

      router.back();
    } finally {
      setBusy(false);
    }
  }

  const needsMatch = result?.items.some(
    (item, index) => checked.has(index) && item.kind !== 'payment',
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        {!result ? (
          <>
            <Card>
              <Txt variant="h3">무엇으로 읽을까요?</Txt>
              <Row wrap gap={space.sm}>
                {HINTS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={hint === option.value}
                    onPress={() => setHint(option.value)}
                  />
                ))}
              </Row>
              <Txt variant="tiny" muted>
                자동으로 두면 내용을 보고 알아서 판단합니다. 참석과 회비가 섞여 있어도 됩니다.
              </Txt>
            </Card>

            <TextInput
              multiline
              value={text}
              onChangeText={setText}
              placeholder={'카톡 대화, 은행 문자, 메모를 그대로 붙여넣으세요.\n\n예) 병준이형 ㅇ / 도현 참석 / 성우 불참'}
              placeholderTextColor={p.textMuted}
              style={{
                minHeight: 200,
                backgroundColor: p.surface,
                borderColor: p.border,
                borderWidth: 1,
                borderRadius: radius.lg,
                padding: space.lg,
                color: p.text,
                fontSize: 15,
                lineHeight: 22,
                textAlignVertical: 'top',
              }}
            />

            {hint !== 'auto' ? (
              <Button label="예시 문구 넣어보기" tone="neutral" small onPress={() => setText(EXAMPLES[hint])} />
            ) : null}

            {error ? (
              <Card style={{ backgroundColor: p.dangerSoft, borderColor: p.dangerSoft }}>
                <Txt variant="small" color={p.danger}>
                  {error}
                </Txt>
              </Card>
            ) : null}

            <Button label="AI로 분석하기" loading={busy} onPress={runParse} />

            {isLocalRepo ? (
              <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
                데모 모드에서는 간단한 규칙 파서가 대신 처리합니다. Supabase를 연결하면 Claude가 분석합니다.
              </Txt>
            ) : null}
          </>
        ) : (
          <>
            <Card>
              <Txt variant="h3">{result.summary || '분석 결과'}</Txt>
              {match ? (
                <Txt variant="tiny" muted>
                  적용 대상 경기: {formatDate(match.date)} {match.kickoff}
                </Txt>
              ) : needsMatch ? (
                <Txt variant="tiny" color={p.danger}>
                  적용할 경기가 없습니다. 회비 항목만 저장됩니다.
                </Txt>
              ) : null}
              {result.unmatched.length ? (
                <Row wrap gap={space.sm}>
                  <Txt variant="tiny" muted>
                    명단에 없는 이름:
                  </Txt>
                  {result.unmatched.map((name) => (
                    <Chip
                      key={name}
                      label={`${name} +`}
                      tone={{ fg: p.warn, bg: p.warnSoft }}
                      onPress={async () => {
                        await addMember({
                          name,
                          nickname: null,
                          role: 'player',
                          backNumber: null,
                          preferredPosition: null,
                          active: true,
                        });
                      }}
                    />
                  ))}
                </Row>
              ) : null}
            </Card>

            {result.items.length === 0 ? (
              <Card>
                <Txt variant="small" muted>
                  읽어낼 항목을 찾지 못했습니다. 문구를 조금 더 구체적으로 적어 보세요.
                </Txt>
              </Card>
            ) : (
              <Card style={{ padding: space.sm, gap: 0 }}>
                {result.items.map((item, index) => {
                  const memberId = memberIdOf(item, index);
                  const resolved = activeMembers.find((member) => member.id === memberId);
                  const on = checked.has(index);
                  return (
                    <View key={index}>
                      {index > 0 ? <Divider /> : null}
                      <Row align="flex-start" style={{ padding: space.sm }} gap={space.md}>
                        <Checkbox
                          checked={on}
                          onToggle={() =>
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            })
                          }
                        />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt variant="h3">{describe(item, resolved?.name ?? item.memberName)}</Txt>
                          <Txt variant="tiny" muted numberOfLines={2}>
                            &ldquo;{item.quote}&rdquo;
                          </Txt>
                          {!memberId && item.kind !== 'payment' ? (
                            <Chip
                              label="누구인지 고르기"
                              tone={{ fg: p.danger, bg: p.dangerSoft }}
                              onPress={() => setPickerIndex(pickerIndex === index ? null : index)}
                            />
                          ) : item.confidence === 'low' ? (
                            <Chip label="확인 필요" tone={{ fg: p.warn, bg: p.warnSoft }} />
                          ) : null}
                          {pickerIndex === index ? (
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ gap: space.sm, paddingVertical: space.sm }}
                            >
                              {activeMembers.map((member) => (
                                <Chip
                                  key={member.id}
                                  label={member.name}
                                  onPress={() => {
                                    setOverrides((prev) => ({ ...prev, [index]: member.id }));
                                    setChecked((prev) => new Set(prev).add(index));
                                    setPickerIndex(null);
                                  }}
                                />
                              ))}
                            </ScrollView>
                          ) : null}
                        </View>
                      </Row>
                    </View>
                  );
                })}
              </Card>
            )}

            <Row gap={space.sm}>
              <Button
                label="다시 입력"
                tone="neutral"
                style={{ flex: 1 }}
                onPress={() => {
                  setResult(null);
                  setError(null);
                }}
              />
              <Button
                label={`${checked.size}건 저장`}
                style={{ flex: 2 }}
                disabled={checked.size === 0}
                loading={busy}
                onPress={commit}
              />
            </Row>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** 검토 목록에 한 줄로 보여줄 문장. */
function describe(item: ParsedItem, name: string): string {
  switch (item.kind) {
    case 'attendance':
      return `${name} · ${STATUS_LABEL[item.status]}${item.note ? ` (${item.note})` : ''}`;
    case 'payment': {
      const who = item.memberId || name !== '(미확인)' ? name : '팀';
      const label = item.ledgerKind === 'expense' ? '지출' : item.ledgerKind === 'due' ? '회비' : '수입';
      return `${who} · ${label} ${won(item.amount)}${item.period ? ` (${item.period})` : ''}`;
    }
    case 'lineup':
      return `${name} · ${item.slotKey ?? item.group}`;
    case 'event':
      return `${name} · ${EVENT_LABEL[item.type] ?? item.type}${item.minute != null ? ` ${item.minute}'` : ''}`;
  }
}
