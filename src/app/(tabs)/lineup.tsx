import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { MAX_QUARTERS, DEFAULT_QUARTERS, useStore } from '@/lib/store';
import {
  availableMembers,
  memberMap,
  playLabel,
  playingTime,
  playsPosition,
  quarterPlay,
} from '@/lib/selectors';
import { pickPhoto } from '@/lib/photo';
import {
  DEFAULT_FORMATION,
  FORMATION_SIZES,
  findFormation,
  formationsForSize,
  sizeForCount,
} from '@/features/lineup/formations';
import { Pitch } from '@/features/lineup/Pitch';
import { ShareLineup } from '@/features/lineup/ShareLineup';
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
import { MatchPicker } from '@/components/MatchPicker';
import { QuickInputFab } from '@/components/QuickInputFab';
import { usePalette } from '@/theme';
import type { LineupSide, LineupSlot, PositionGroup } from '@/lib/types';

/**
 * 출전.
 *
 * 이 팀은 자체경기를 한다. 라인업은 운동장 화이트보드 한 장에 두 팀이 같이 그려지고,
 * 쿼터마다 사람이 바뀐다. 그래서 화면도 (쿼터 × 팀) 한 칸씩 본다.
 *
 * 앱에서 라인업을 "짜는" 게 아니다. 이미 화이트보드에서 짜고 왔다. 여기서 하는 일은
 * 그걸 옮겨 담아서 "누가 몇 번, 몇 쿼터에 뛰었나"를 셀 수 있게 만드는 것이다.
 * 그래서 사진이 맨 위에 있고, 아래 출전 요약이 이 화면의 결론이다.
 */
const SIDE_LABEL: Record<LineupSide, string> = { A: 'A팀', B: 'B팀' };
const GROUP_ORDER: PositionGroup[] = ['GK', 'DF', 'MF', 'FW'];
type SummarySort = 'least' | 'position';

export default function LineupScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const saveLineup = useStore((state) => state.saveLineup);
  const setLineupPhoto = useStore((state) => state.setLineupPhoto);

  const [quarter, setQuarter] = useState(1);
  const [side, setSide] = useState<LineupSide>('A');
  const [formationId, setFormationId] = useState(DEFAULT_FORMATION.id);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [slots, setSlots] = useState<LineupSlot[]>(DEFAULT_FORMATION.slots.map(toEmpty));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SummarySort>('least');

  const saved = useMemo(
    () =>
      data?.lineups.find(
        (row) => row.matchId === activeMatchId && row.quarter === quarter && row.side === side,
      ) ?? null,
    [data?.lineups, activeMatchId, quarter, side],
  );

  const available = useMemo(
    () => (data && activeMatchId ? availableMembers(data, activeMatchId) : []),
    [data, activeMatchId],
  );

  /**
   * 몇 쿼터짜리 경기인가. 이미 적어 둔 쿼터가 있으면 거기까지, 없으면 4쿼터로 연다.
   * 6쿼터까지 늘릴 수 있게 두되 처음부터 여섯 개를 보여 주지는 않는다 —
   * 대부분의 날은 4쿼터에서 끝난다.
   */
  const quarterCount = useMemo(() => {
    const used = (data?.lineups ?? [])
      .filter((row) => row.matchId === activeMatchId)
      .map((row) => row.quarter);
    return Math.min(MAX_QUARTERS, Math.max(DEFAULT_QUARTERS, ...used, 0));
  }, [data?.lineups, activeMatchId]);

  // 경기·쿼터·팀 중 하나라도 바뀌면 그 칸에 저장된 라인업을 다시 불러온다.
  // 저장된 게 없으면 참석 인원에 맞는 규격으로 시작한다 — 자체경기라 한 팀은 그 절반이다.
  useEffect(() => {
    if (saved) {
      setFormationId(saved.formationId);
      setSlots(saved.slots);
    } else {
      const half = Math.floor(available.length / 2);
      const fit =
        (half > 0 ? formationsForSize(sizeForCount(half))[0] : undefined) ?? DEFAULT_FORMATION;
      setFormationId(fit.id);
      setSlots(fit.slots.map(toEmpty));
    }
    setSelectedKey(null);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchId, quarter, side, saved?.id]);

  const members = useMemo(() => memberMap(data?.members ?? []), [data?.members]);
  const play = useMemo(
    () => (data && activeMatchId ? quarterPlay(data, activeMatchId) : new Map()),
    [data, activeMatchId],
  );
  const recentTime = useMemo(
    () =>
      data
        ? new Map(
            playingTime(data, 6, activeMatchId ?? undefined).map((row) => [row.member.id, row]),
          )
        : new Map(),
    [data, activeMatchId],
  );

  if (!data) return null;
  const match = data.matches.find((item) => item.id === activeMatchId);

  const formation = findFormation(formationId);
  const assignedIds = new Set(slots.map((slot) => slot.memberId).filter(Boolean) as string[]);
  // 이 쿼터의 다른 팀에 이미 선 사람. 한 쿼터에 두 팀을 동시에 뛸 수는 없다.
  const otherSide = data.lineups.find(
    (row) => row.matchId === activeMatchId && row.quarter === quarter && row.side !== side,
  );
  const takenByOther = new Set(
    (otherSide?.slots ?? []).map((slot) => slot.memberId).filter(Boolean) as string[],
  );
  const bench = available.filter((member) => !assignedIds.has(member.id));

  /** 이 경기의 출전 요약. 참석했는데 한 번도 안 뛴 사람도 0으로 넣는다. */
  const summary = available
    .map((member) => {
      const row = play.get(member.id);
      return {
        member,
        quarters: (row?.quarters ?? []) as number[],
        label: row ? playLabel(row) : '아직 안 뛰었어요',
        group: (row?.positions?.[0] ?? member.positions[0] ?? 'MF') as PositionGroup,
      };
    })
    .sort((a, b) => {
      if (sort === 'position') {
        const gap = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
        if (gap !== 0) return gap;
      }
      return (
        a.quarters.length - b.quarters.length || a.member.name.localeCompare(b.member.name, 'ko')
      );
    });

  function changeFormation(nextId: string) {
    const next = findFormation(nextId);
    // 포메이션을 바꿔도 이미 배치한 선수는 그룹별로 최대한 유지한다.
    const pool = [...slots].filter((slot) => slot.memberId);
    const mapped = next.slots.map((slot) => {
      const index = pool.findIndex((candidate) => candidate.group === slot.group);
      const taken = index >= 0 ? pool.splice(index, 1)[0] : null;
      return { ...slot, memberId: taken?.memberId ?? null };
    });
    setFormationId(nextId);
    setSlots(mapped);
    setSelectedKey(null);
    setDirty(true);
  }

  /** 슬롯을 두 번 누르면 자리 교체, 대기 선수를 누르면 배치. */
  function handleSlotPress(key: string) {
    if (!selectedKey) {
      setSelectedKey(key);
      return;
    }
    if (selectedKey === key) {
      setSelectedKey(null);
      return;
    }
    setSlots((prev) => {
      const a = prev.find((slot) => slot.key === selectedKey);
      const b = prev.find((slot) => slot.key === key);
      if (!a || !b) return prev;
      return prev.map((slot) => {
        if (slot.key === a.key) return { ...slot, memberId: b.memberId };
        if (slot.key === b.key) return { ...slot, memberId: a.memberId };
        return slot;
      });
    });
    setSelectedKey(null);
    setDirty(true);
  }

  function assign(memberId: string) {
    const targetKey =
      selectedKey ??
      // 선택된 자리가 없으면 이 사람이 볼 수 있는 빈 자리를 먼저 찾는다.
      slots.find((slot) => {
        const member = members.get(memberId);
        return !slot.memberId && member ? playsPosition(member, slot.group) : false;
      })?.key ??
      slots.find((slot) => !slot.memberId)?.key;
    if (!targetKey) return;
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.key === targetKey) return { ...slot, memberId };
        // 다른 자리에 이미 있으면 비운다.
        if (slot.memberId === memberId) return { ...slot, memberId: null };
        return slot;
      }),
    );
    setSelectedKey(null);
    setDirty(true);
  }

  async function attachPhoto(source: 'camera' | 'library') {
    if (!match) return;
    setBusy(true);
    try {
      const photo = await pickPhoto(source);
      if (photo) await setLineupPhoto(match.id, quarter, side, photo);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <MatchPicker />
        {!match ? (
          <Card>
            <Empty text={'경기를 먼저 만들어 주세요.\n설정에서 추가할 수 있어요.'} />
          </Card>
        ) : (
          <>
            {/* 쿼터 → 팀 순으로 좁혀 간다. 화이트보드를 읽는 순서와 같다. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm }}
            >
              {Array.from({ length: quarterCount }, (_, index) => index + 1).map((value) => (
                <Chip
                  key={value}
                  label={`${value}쿼터`}
                  selected={value === quarter}
                  onPress={() => setQuarter(value)}
                />
              ))}
              {quarterCount < MAX_QUARTERS ? (
                <Chip label="+ 쿼터" onPress={() => setQuarter(quarterCount + 1)} />
              ) : null}
            </ScrollView>

            <Segmented
              value={side}
              onChange={setSide}
              options={[
                { value: 'A' as LineupSide, label: 'A팀' },
                { value: 'B' as LineupSide, label: 'B팀' },
              ]}
            />

            {/* 화이트보드 사진이 원본이다. 옮겨 적은 게 맞는지 여기서 대조한다. */}
            <Card>
              <Row justify="space-between">
                <Txt variant="h3">
                  {quarter}쿼터 {SIDE_LABEL[side]} 화이트보드
                </Txt>
                {saved?.photoUri ? <Txt variant="tiny" color={p.ok}>사진 있어요</Txt> : null}
              </Row>

              {saved?.photoUri ? (
                <Image
                  source={{ uri: saved.photoUri }}
                  accessibilityLabel={`${quarter}쿼터 ${SIDE_LABEL[side]} 화이트보드 사진`}
                  resizeMode="contain"
                  style={{
                    width: '100%',
                    aspectRatio: 4 / 3,
                    borderRadius: radius.md,
                    backgroundColor: p.surfaceAlt,
                  }}
                />
              ) : (
                <Txt variant="tiny" muted>
                  운동장에서 찍어 두면 나중에 옮겨 적을 때 대조할 수 있어요. 사진을 올려도 아래
                  전술판에서 그대로 고칠 수 있어요.
                </Txt>
              )}

              <Row gap={space.sm}>
                <Button
                  label={saved?.photoUri ? '다시 찍기' : '화이트보드 찍기'}
                  icon="camera"
                  tone="neutral"
                  small
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={() => attachPhoto('camera')}
                />
                <Button
                  label="앨범에서 고르기"
                  tone="neutral"
                  small
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={() => attachPhoto('library')}
                />
              </Row>
            </Card>

            {/* 인원 규격을 먼저 고르고, 그 안에서 포메이션을 고른다. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm }}
            >
              {FORMATION_SIZES.map((size) => (
                <Chip
                  key={size}
                  label={`${size}인`}
                  selected={size === formation.size}
                  onPress={() => {
                    const next = formationsForSize(size)[0];
                    if (next) changeFormation(next.id);
                  }}
                />
              ))}
            </ScrollView>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm }}
            >
              {formationsForSize(formation.size).map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  selected={option.id === formationId}
                  onPress={() => changeFormation(option.id)}
                />
              ))}
            </ScrollView>

            <Pitch
              slots={slots}
              members={members}
              selectedKey={selectedKey}
              onSelectSlot={handleSlotPress}
            />

            <Txt variant="tiny" muted>
              자리를 누른 뒤 아래 이름을 누르면 배치돼요. 자리 두 곳을 차례로 누르면 서로 바뀌어요.
            </Txt>

            <SectionHeader title={`대기 (${bench.length}명)`} />
            <Card>
              {available.length === 0 ? (
                <Empty text={'참석으로 표시된 인원이 없어요.\n참석 탭에서 먼저 집계해 주세요.'} />
              ) : bench.length === 0 ? (
                <Empty text="참석자 전원을 배치했어요." />
              ) : (
                <Row wrap gap={space.sm}>
                  {bench.map((member) => {
                    const count = (play.get(member.id)?.quarters ?? []).length;
                    const other = takenByOther.has(member.id);
                    return (
                      <Chip
                        key={member.id}
                        label={`${member.name} · ${count}쿼터${other ? ' · 상대편' : ''}`}
                        onPress={() => assign(member.id)}
                      />
                    );
                  })}
                </Row>
              )}
            </Card>

            <Row gap={space.sm}>
              <Button
                label="전부 비우기"
                tone="neutral"
                small
                style={{ flex: 1 }}
                onPress={() => {
                  setSlots((prev) => prev.map((slot) => ({ ...slot, memberId: null })));
                  setDirty(true);
                }}
              />
              <Button
                label={dirty ? '이 쿼터 저장하기' : '저장했어요'}
                small
                style={{ flex: 1 }}
                disabled={!dirty}
                onPress={async () => {
                  await saveLineup({
                    matchId: match.id,
                    quarter,
                    side,
                    formationId,
                    slots,
                    photoUri: saved?.photoUri ?? null,
                    photoPath: saved?.photoPath ?? null,
                  });
                  setDirty(false);
                }}
              />
            </Row>

            <ShareLineup
              teamName={data.team.name}
              match={match}
              formationId={formationId}
              slots={slots}
              members={members}
              bench={bench}
            />

            {/* 이 화면의 결론. 위에서 옮겨 적은 게 여기 숫자로 모인다. */}
            <SectionHeader title="이 경기 출전" />
            <Segmented
              value={sort}
              onChange={setSort}
              options={[
                { value: 'least' as SummarySort, label: '덜 뛴 순' },
                { value: 'position' as SummarySort, label: '포지션 순' },
              ]}
            />
            <Card style={{ padding: space.sm, gap: 0 }}>
              {summary.length === 0 ? (
                <Empty text={'참석자가 정해지면 여기서 세요.\n쿼터마다 라인업을 넣으면 자동으로 쌓여요.'} />
              ) : (
                summary.map((row, index) => {
                  const time = recentTime.get(row.member.id);
                  return (
                    <View key={row.member.id}>
                      {index > 0 ? <Divider /> : null}
                      <Row justify="space-between" style={{ padding: space.sm }}>
                        <View style={{ flexShrink: 1 }}>
                          <Txt variant="body">
                            {row.member.name} {row.label}
                          </Txt>
                          <Txt variant="tiny" muted>
                            {time?.perMatch != null
                              ? `최근 평균 ${time.perMatch.toFixed(1)}쿼터`
                              : '최근 출전 기록 없음'}
                          </Txt>
                        </View>
                        <Txt
                          variant="h3"
                          tabular
                          color={row.quarters.length === 0 ? p.danger : p.text}
                          style={{ minWidth: 34, textAlign: 'right' }}
                        >
                          {row.quarters.length}
                        </Txt>
                      </Row>
                    </View>
                  );
                })
              )}
            </Card>

            <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
              화이트보드를 찍어서 올리면 &ldquo;사진으로 넣기&rdquo;로 자리까지 읽어 줘요. 읽은
              결과는 확인한 뒤에만 저장돼요.
            </Txt>
          </>
        )}
      </Screen>
      <QuickInputFab hint="lineup" />
    </View>
  );
}

function toEmpty(slot: Omit<LineupSlot, 'memberId'>): LineupSlot {
  return { ...slot, memberId: null };
}
