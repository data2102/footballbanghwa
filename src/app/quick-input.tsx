import { useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { blankMemberFields, useStore } from '@/lib/store';
import { parseText } from '@/lib/ai/client';
import { isLocalRepo } from '@/lib/repo';
import { pickPhoto, type PickedPhoto } from '@/lib/photo';
import { takeHandedPhotos } from '@/lib/photoHandoff';
import { findFormation, normalizeFormationId } from '@/features/lineup/formations';
import { formatDate, todayISO, won } from '@/lib/format';
import { availableMembers } from '@/lib/selectors';
import { Button, Card, Checkbox, Chip, Divider, Row, Screen, Txt, radius, space } from '@/components/ui';
import { Icon } from '@/components/icons';
import { usePalette } from '@/theme';
import type { ParseIntent, ParseResponse, ParsedItem } from '@/lib/ai/contract';
import type { AttendanceStatus, LineupSlot, PositionGroup } from '@/lib/types';

type Hint = Exclude<ParseIntent, 'mixed' | 'unknown'>;

/**
 * 올릴 수 있는 사진 수. 긴 캡처는 한 장이 여러 조각으로 잘려 나가므로,
 * 실제로 AI 에 가는 장수는 이보다 많다(함수 쪽 MAX_IMAGES 가 그 한도를 본다).
 */
const MAX_PHOTOS = 3;

const HINTS: { value: Hint | 'auto'; label: string }[] = [
  { value: 'auto', label: '자동' },
  { value: 'attendance', label: '참석' },
  { value: 'payment', label: '회비' },
  { value: 'lineup', label: '라인업' },
  { value: 'event', label: '기록' },
  { value: 'profile', label: '회원' },
];

const EXAMPLES: Record<Hint, string> = {
  attendance:
    '이번주 일요일 조기축구\n병준이형 ㅇ\n도현 참석\n성우 불참(출장)\n민석 30분 늦게 감\n우진 ㅇ\n재영 못가요',
  payment:
    '[Web발신]\n08/19 09:12 입금 30,000 이도현\n잔액 1,240,000\n\n박성우 8월 회비 3만 보냈어요\n구장비 12만원 결제',
  lineup:
    '1쿼터\nA팀 4-3-3\n골키퍼 병준이형\n수비 도현 성우 민석 우진\n중원 재영 세훈 현수\n공격 태윤 상혁 지호\n\nB팀\n골키퍼 현우\n수비 지훈 상민 태호',
  event: '전반 12분 태윤이 골, 지호 어시\n후반 10분 상혁 골\n병준이형 선방 세 번',
  profile: '태윤이 왼발 잘 쓰고 위치선정 좋아\n병준이형은 골키퍼 고정\n민석이 작년에 발목 다쳤으니 연속 출전은 피하자',
};

const STATUS_LABEL: Record<AttendanceStatus | 'pending', string> = {
  attending: '참석',
  absent: '불참',
  late: '지각',
  voted: '투표함',
  unknown: '판단 못 함',
  // 아직 투표를 안 한 사람. 저장하면 있던 참석 줄을 지운다(미투표 = 줄이 없음).
  pending: '미투표로',
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
  const clearAttendance = useStore((state) => state.clearAttendance);
  const addLedger = useStore((state) => state.addLedger);
  const addEvent = useStore((state) => state.addEvent);
  const saveLineup = useStore((state) => state.saveLineup);
  const addMember = useStore((state) => state.addMember);
  const updateMember = useStore((state) => state.updateMember);

  const [hint, setHint] = useState<Hint | 'auto'>((params.hint as Hint) ?? 'auto');
  /**
   * 화이트보드에 "1쿼터"가 안 적혀 있는 날이 있다. 그럴 때 넣을 쿼터.
   * 팀(A/B)은 사진 한 장에 둘 다 있어서 AI 가 왼쪽·오른쪽으로 가른다.
   */
  const [quarter, setQuarter] = useState(1);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResponse | null>(null);
  /** 사용자가 체크한 항목. AI가 사람을 특정하지 못한 항목은 기본으로 꺼둔다. */
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  const activeMembers = useMemo(
    () => (data?.members ?? []).filter((member) => member.active),
    [data?.members],
  );

  /*
   * 참석 탭에서 사진을 고르고 넘어오면 그 사진을 들고 시작한다.
   * 브라우저가 "누른 그 순간"이 아니면 사진첩을 안 열어 줘서, 여는 건 버튼 쪽에서 한다.
   */
  useEffect(() => {
    const handed = takeHandedPhotos();
    if (handed) setPhotos(handed);
  }, []);

  if (!data) return null;
  const match = data.matches.find((item) => item.id === activeMatchId) ?? null;
  /** AI 에 실제로 가는 장수. 긴 캡처는 한 장이 여러 조각이 된다. */
  const sliceCount = photos.reduce((sum, photo) => sum + photo.parts.length, 0);

  function memberIdOf(item: ParsedItem, index: number): string | null {
    return overrides[index] ?? item.memberId;
  }

  async function attach(source: 'camera' | 'library') {
    try {
      const photo = await pickPhoto(source);
      if (photo) setPhotos((prev) => [...prev, photo].slice(0, MAX_PHOTOS));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '사진을 불러오지 못했어요.');
    }
  }

  async function runParse() {
    if (!text.trim() && photos.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await parseText({
        text,
        /*
         * 길쭉한 캡처는 사진 하나가 여러 조각으로 잘려 있다. 화면에는 한 장으로
         * 보이지만 AI 에는 조각을 전부 보낸다 — 줄여서 한 장으로 보내면 이름이 뭉개진다.
         */
        images: photos.flatMap((photo) =>
          photo.parts.map((part) => ({ mediaType: photo.mediaType, data: part.base64 })),
        ),
        members: activeMembers,
        team: data!.team,
        hint: hint === 'auto' ? undefined : hint,
        // 화이트보드에 "1쿼터"가 안 적혀 있는 날이 있다. 그럴 때 넣을 기본 쿼터를 알려 준다.
        quarter: quarter,
      });
      setResult(response);
      setChecked(
        new Set(response.items.map((item, index) => (item.memberId ? index : -1)).filter((i) => i >= 0)),
      );
      setOverrides({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '분석하지 못했어요. 다시 시도해 주세요.');
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
      const pendingMemberIds: string[] = [];

      for (const { item, index } of selected) {
        const memberId = memberIdOf(item, index);
        if (!memberId && item.kind !== 'payment') continue;

        if (item.kind === 'attendance' && match) {
          /*
           * 미투표는 "줄이 없음"이다. 그래서 pending 은 새 줄을 쓰는 게 아니라
           * 있던 줄을 지운다. 한 건씩 지우면 아흔 명일 때 왕복이 아흔 번이라 모아서 지운다.
           */
          if (item.status === 'pending') {
            pendingMemberIds.push(memberId!);
          } else {
            await setAttendance(match.id, memberId!, item.status, { note: item.note, source: 'ai' });
          }
        } else if (item.kind === 'payment') {
          await addLedger({
            memberId,
            kind: item.ledgerKind,
            amount: item.amount,
            period: item.ledgerKind === 'due' ? item.period : null,
            occurredOn: item.occurredOn ?? todayISO(),
            memo: item.memo,
            source: 'ai',
          });
        } else if (item.kind === 'event' && match) {
          await addEvent({ matchId: match.id, memberId: memberId!, type: item.type, minute: item.minute });
        } else if (item.kind === 'profile') {
          const member = data!.members.find((row) => row.id === memberId);
          if (member) {
            await updateMember({
              ...member,
              // 기존 태그를 지우지 않고 더한다. 문자 한 줄이 회원 카드를 날려버리면 안 된다.
              strengths: [...new Set([...member.strengths, ...item.strengths])],
              // AI 가 말해 준 자리를 더한다. 이미 있던 자리를 지우지 않는다.
              positions:
                item.position && !member.positions.includes(item.position)
                  ? [...member.positions, item.position]
                  : member.positions,
              backNumber: item.backNumber ?? member.backNumber,
              note: item.note ?? member.note,
            });
          }
        } else if (item.kind === 'lineup') {
          lineupItems.push({ item, memberId: memberId! });
        }
      }

      if (pendingMemberIds.length && match) {
        await clearAttendance(match.id, pendingMemberIds);
      }

      if (lineupItems.length && match) {
        /*
         * 화이트보드 한 장에 두 팀이 그려져 있고, 쿼터마다 다시 그린다.
         * 그래서 읽어 온 자리들을 (쿼터, 팀)으로 나눠서 각각 한 판씩 저장한다.
         * 한 판에 몰아 넣으면 A팀 골키퍼와 B팀 골키퍼가 같은 자리를 두고 다툰다.
         */
        const boards = new Map<string, { item: ParsedItem; memberId: string }[]>();
        for (const entry of lineupItems) {
          if (entry.item.kind !== 'lineup') continue;
          const key = `${entry.item.quarter ?? quarter}:${entry.item.side ?? 'A'}`;
          boards.set(key, [...(boards.get(key) ?? []), entry]);
        }

        for (const [key, entries] of boards) {
          const [q, sideRaw] = key.split(':');
          const boardQuarter = Number(q);
          const boardSide = sideRaw === 'B' ? 'B' : 'A';
          const existing = data!.lineups.find(
            (row) =>
              row.matchId === match.id &&
              row.quarter === boardQuarter &&
              row.side === boardSide,
          );
          const formationId =
            normalizeFormationId(result.formation) ?? existing?.formationId ?? '4-3-3';
          const formation = findFormation(formationId);
          const slots: LineupSlot[] = formation.slots.map((slot) => ({ ...slot, memberId: null }));

          // slotKey가 있으면 그 자리에, 없으면 같은 그룹의 빈 자리에 순서대로 넣는다.
          for (const { item, memberId } of entries) {
            if (item.kind !== 'lineup') continue;
            const byKey = item.slotKey ? slots.find((slot) => slot.key === item.slotKey) : undefined;
            const target =
              byKey && !byKey.memberId
                ? byKey
                : slots.find((slot) => slot.group === (item.group as PositionGroup) && !slot.memberId);
            if (target) target.memberId = memberId;
          }

          await saveLineup({
            matchId: match.id,
            quarter: boardQuarter,
            side: boardSide,
            formationId,
            slots,
            // 사진은 이미 붙어 있으면 그대로 둔다. 읽어 왔다고 원본을 지우면 안 된다.
            photoUri: existing?.photoUri ?? null,
            photoPath: existing?.photoPath ?? null,
          });
        }
      }

      router.back();
    } finally {
      setBusy(false);
    }
  }

  const needsMatch = result?.items.some(
    (item, index) => checked.has(index) && (item.kind === 'attendance' || item.kind === 'event' || item.kind === 'lineup'),
  );

  const inputStyle = {
    minHeight: 180,
    backgroundColor: p.surface,
    borderColor: p.borderStrong,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.lg,
    color: p.text,
    fontSize: 15,
    lineHeight: 24,
    textAlignVertical: 'top' as const,
  };

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
                자동으로 두면 내용을 보고 알아서 판단해요. 참석과 회비가 섞여 있어도 괜찮아요.
              </Txt>

              {hint === 'lineup' ? (
                <>
                  <Divider />
                  <Txt variant="h3">몇 쿼터인가요?</Txt>
                  <Row wrap gap={space.sm}>
                    {[1, 2, 3, 4, 5, 6].map((value) => (
                      <Chip
                        key={value}
                        label={`${value}쿼터`}
                        selected={quarter === value}
                        onPress={() => setQuarter(value)}
                      />
                    ))}
                  </Row>
                  <Txt variant="tiny" muted>
                    사진이나 글에 쿼터가 적혀 있으면 그쪽을 따라요. 없을 때만 여기 고른 쿼터로 넣어요.
                    A팀·B팀은 화이트보드에서 갈라 읽어요.
                  </Txt>
                </>
              ) : null}
            </Card>

            {/*
              어느 경기에 들어가는지는 저장하기 직전이 아니라 올리기 전에 보여야 한다.
              참석 탭에서 날짜를 고르고 넘어왔는데 화면이 아무 말도 안 하면,
              그 날짜로 가는 게 맞는지 확인할 길이 없다.
            */}
            {match ? (
              <Card style={{ backgroundColor: p.primarySoft, borderColor: p.primarySoft }}>
                <Txt variant="small" color={p.primaryStrong}>
                  {formatDate(match.date)} 경기에 들어가요
                </Txt>
                <Txt variant="tiny" muted>
                  다른 날짜에 넣으려면 참석 탭에서 날짜를 먼저 고르고 오세요.
                </Txt>
              </Card>
            ) : null}

            <TextInput
              multiline
              value={text}
              onChangeText={setText}
              placeholder={'카톡 대화, 은행 문자, 메모를 그대로 붙여넣으세요.\n\n예) 병준이형 ㅇ / 도현 참석 / 성우 불참'}
              placeholderTextColor={p.textFaint}
              style={inputStyle}
            />

            {/*
              길쭉한 캡처는 줄이면 이름이 뭉개져서 잘라 보낸다. 그 사실을 안 알리면
              "왜 이건 잘 읽히지" 나 "왜 이건 오래 걸리지"가 설명되지 않는다.
            */}
            {sliceCount > photos.length ? (
              <Txt variant="tiny" muted>
                긴 캡처라 {sliceCount}조각으로 나눠 읽어요. 글자를 줄이지 않으니 이름이 또렷해요.
              </Txt>
            ) : null}

            <Row gap={space.sm}>
              <Button
                label="사진 찍기"
                icon="camera"
                tone="neutral"
                style={{ flex: 1 }}
                onPress={() => attach('camera')}
              />
              <Button
                label="사진첩에서"
                icon="image"
                tone="neutral"
                style={{ flex: 1 }}
                onPress={() => attach('library')}
              />
            </Row>
            <Txt variant="tiny" muted>
              손으로 쓴 명단, 화이트보드 작전판, 은행 앱 화면을 찍어도 읽어요. 최대 {MAX_PHOTOS}장까지
              올릴 수 있어요. 긴 캡처는 알아서 잘라서 읽으니 그대로 올리세요.
            </Txt>

            {photos.length ? (
              <Row wrap gap={space.sm}>
                {photos.map((photo, index) => (
                  <Pressable
                    key={photo.uri}
                    accessibilityLabel={`${index + 1}번째 사진 빼기`}
                    onPress={() => setPhotos((prev) => prev.filter((item) => item.uri !== photo.uri))}
                    style={{ position: 'relative' }}
                  >
                    <Image
                      source={{ uri: photo.uri }}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: p.border,
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: p.text,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name="close" size={13} color={p.surface} />
                    </View>
                  </Pressable>
                ))}
              </Row>
            ) : null}

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

            <Button
              label={photos.length ? `사진 ${photos.length}장과 함께 분석하기` : '붙여넣은 내용 분석하기'}
              loading={busy}
              disabled={!text.trim() && photos.length === 0}
              onPress={runParse}
            />

            {isLocalRepo ? (
              <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
                데모 모드에서는 간단한 규칙 파서가 대신 처리해요. Supabase를 연결하면 Claude가 사진까지 읽어요.
              </Txt>
            ) : null}
          </>
        ) : (
          <>
            <Card>
              <Txt variant="h3">{result.summary || '분석 결과예요'}</Txt>
              {match ? (
                <Txt variant="tiny" muted>
                  {formatDate(match.date)} 경기에 반영돼요
                </Txt>
              ) : needsMatch ? (
                <Txt variant="tiny" color={p.danger}>
                  반영할 경기가 없어요. 회비와 회원 항목만 저장돼요.
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
                      label={`${name} 추가하기`}
                      tone={{ fg: p.warn, bg: p.warnSoft }}
                      onPress={() => addMember({ name, ...blankMemberFields() })}
                    />
                  ))}
                </Row>
              ) : null}
            </Card>

            {result.items.length === 0 ? (
              <Card>
                <Txt variant="small" muted>
                  읽어낼 항목을 찾지 못했어요. 문구를 조금 더 구체적으로 적거나, 사진을 더 밝은 데서 다시 찍어
                  주세요.
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
                            <Chip label="확인이 필요해요" tone={{ fg: p.warn, bg: p.warnSoft }} />
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
                label={`${checked.size}건 저장하기`}
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
      return `${who} · ${label} ${won(item.amount)}`;
    }
    case 'lineup':
      return `${name} · ${item.quarter ?? '?'}쿼터 ${item.side ?? 'A'}팀 · ${item.slotKey ?? item.group}`;
    case 'event':
      return `${name} · ${EVENT_LABEL[item.type] ?? item.type}${item.minute != null ? ` ${item.minute}분` : ''}`;
    case 'profile': {
      const parts = [
        item.strengths.length ? item.strengths.join(', ') : null,
        item.position ? `${item.position} 고정` : null,
        item.backNumber != null ? `${item.backNumber}번` : null,
        item.note ? '메모' : null,
      ].filter(Boolean);
      return `${name} · ${parts.join(' · ') || '회원 정보'}`;
    }
  }
}
