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
import { usePalette } from '@/theme';
import type { LineupSide, LineupSlot, PositionGroup } from '@/lib/types';

/**
 * 출전.
 *
 * 이 팀은 자체경기를 한다. 라인업은 운동장 화이트보드 한 장에 두 팀이 같이 그려지고,
 * 쿼터마다 사람이 바뀐다. 그래서 화면도 판 하나에 두 팀을 같이 얹는다 — 위가 A팀,
 * 아래가 B팀. 팀을 하나씩 따로 보여 주면 옮겨 적는 사람이 화이트보드와 화면을 번갈아
 * 보며 머릿속에서 두 장을 합쳐야 한다.
 *
 * 자리를 누르면 그 팀이 "지금 채우는 팀"이 되고, 포메이션과 대기 명단이 그 팀을 따라간다.
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
  /** 지금 포메이션·대기 명단이 따라가는 팀. 자리를 누르면 그쪽으로 옮겨 간다. */
  const [side, setSide] = useState<LineupSide>('A');
  const [formationIds, setFormationIds] = useState<Record<LineupSide, string>>({
    A: DEFAULT_FORMATION.id,
    B: DEFAULT_FORMATION.id,
  });
  const [slotsBySide, setSlotsBySide] = useState<Record<LineupSide, LineupSlot[]>>({
    A: DEFAULT_FORMATION.slots.map(toEmpty),
    B: DEFAULT_FORMATION.slots.map(toEmpty),
  });
  const [selected, setSelected] = useState<{ side: LineupSide; key: string } | null>(null);
  const [dirty, setDirty] = useState<Record<LineupSide, boolean>>({ A: false, B: false });
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SummarySort>('least');

  const savedBySide = useMemo(() => {
    const find = (which: LineupSide) =>
      data?.lineups.find(
        (row) => row.matchId === activeMatchId && row.quarter === quarter && row.side === which,
      ) ?? null;
    return { A: find('A'), B: find('B') };
  }, [data?.lineups, activeMatchId, quarter]);

  const saved = savedBySide[side];

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

  // 경기나 쿼터가 바뀌면 그 쿼터에 저장된 두 팀을 한꺼번에 다시 불러온다.
  // 저장된 게 없으면 참석 인원에 맞는 규격으로 시작한다 — 자체경기라 한 팀은 그 절반이다.
  useEffect(() => {
    const half = Math.floor(available.length / 2);
    const fit =
      (half > 0 ? formationsForSize(sizeForCount(half))[0] : undefined) ?? DEFAULT_FORMATION;
    const load = (row: typeof savedBySide.A) =>
      row
        ? { id: row.formationId, slots: row.slots }
        : { id: fit.id, slots: fit.slots.map(toEmpty) };
    const a = load(savedBySide.A);
    const b = load(savedBySide.B);
    setFormationIds({ A: a.id, B: b.id });
    setSlotsBySide({ A: a.slots, B: b.slots });
    setSelected(null);
    setDirty({ A: false, B: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchId, quarter, savedBySide.A?.id, savedBySide.B?.id]);

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

  const slots = slotsBySide[side];
  const formationId = formationIds[side];
  const formation = findFormation(formationId);
  const other: LineupSide = side === 'A' ? 'B' : 'A';

  // 이 쿼터의 다른 팀에 이미 선 사람. 한 쿼터에 두 팀을 동시에 뛸 수는 없다.
  // 저장된 것이 아니라 지금 화면에 놓인 것을 본다 — 두 팀을 같이 짜는 중이니까.
  const takenByOther = new Set(
    slotsBySide[other].map((slot) => slot.memberId).filter(Boolean) as string[],
  );
  const assignedIds = new Set([
    ...(slots.map((slot) => slot.memberId).filter(Boolean) as string[]),
    ...takenByOther,
  ]);
  const bench = available.filter((member) => !assignedIds.has(member.id));
  /** 아직 안 올린 팀. 둘 다 손댔으면 한 번에 올린다. */
  const unsaved = (['A', 'B'] as LineupSide[]).filter((which) => dirty[which]);

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

  /** 지금 채우는 팀의 자리들만 바꾼다. */
  function updateSlots(which: LineupSide, next: (prev: LineupSlot[]) => LineupSlot[]) {
    setSlotsBySide((prev) => ({ ...prev, [which]: next(prev[which]) }));
    setDirty((prev) => ({ ...prev, [which]: true }));
  }

  function changeFormation(nextId: string) {
    const next = findFormation(nextId);
    // 포메이션을 바꿔도 이미 배치한 선수는 그룹별로 최대한 유지한다.
    updateSlots(side, (prev) => {
      const pool = prev.filter((slot) => slot.memberId);
      return next.slots.map((slot) => {
        const index = pool.findIndex((candidate) => candidate.group === slot.group);
        const taken = index >= 0 ? pool.splice(index, 1)[0] : null;
        return { ...slot, memberId: taken?.memberId ?? null };
      });
    });
    setFormationIds((prev) => ({ ...prev, [side]: nextId }));
    setSelected(null);
  }

  /**
   * 자리를 누르면 그 팀이 지금 채우는 팀이 된다. 같은 팀에서 두 자리를 차례로 누르면
   * 서로 바뀐다. 다른 팀 자리를 누르면 교체가 아니라 그쪽으로 넘어간 것으로 본다 —
   * 두 팀 사이에 자리를 맞바꾸는 건 실수인 경우가 훨씬 많다.
   */
  function handleSlotPress(which: LineupSide, key: string) {
    if (which !== side) {
      setSide(which);
      setSelected({ side: which, key });
      return;
    }
    if (!selected || selected.side !== which) {
      setSelected({ side: which, key });
      return;
    }
    if (selected.key === key) {
      setSelected(null);
      return;
    }
    const from = selected.key;
    updateSlots(which, (prev) => {
      const a = prev.find((slot) => slot.key === from);
      const b = prev.find((slot) => slot.key === key);
      if (!a || !b) return prev;
      return prev.map((slot) => {
        if (slot.key === a.key) return { ...slot, memberId: b.memberId };
        if (slot.key === b.key) return { ...slot, memberId: a.memberId };
        return slot;
      });
    });
    setSelected(null);
  }

  function assign(memberId: string) {
    const member = members.get(memberId);
    const targetKey =
      (selected?.side === side ? selected.key : null) ??
      // 고른 자리가 없으면 이 사람이 볼 수 있는 빈 자리를 먼저 찾는다.
      slots.find((slot) => !slot.memberId && member && playsPosition(member, slot.group))?.key ??
      slots.find((slot) => !slot.memberId)?.key;
    if (!targetKey) return;
    updateSlots(side, (prev) =>
      prev.map((slot) => {
        if (slot.key === targetKey) return { ...slot, memberId };
        // 다른 자리에 이미 있으면 비운다.
        if (slot.memberId === memberId) return { ...slot, memberId: null };
        return slot;
      }),
    );
    // 한 쿼터에 두 팀을 동시에 뛸 수는 없다. 상대편에 있던 사람이면 거기서 뺀다.
    if (takenByOther.has(memberId)) {
      updateSlots(other, (prev) =>
        prev.map((slot) => (slot.memberId === memberId ? { ...slot, memberId: null } : slot)),
      );
    }
    setSelected(null);
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

          {/*
            판에는 두 팀이 같이 보인다. 이 칸은 "지금 어느 팀을 채우는가"만 고른다 —
            포메이션과 아래 대기 명단이 이 팀을 따라간다. 자리를 누르면 자동으로 넘어간다.
          */}
          <Row justify="space-between">
            <Txt variant="tiny" muted>
              지금 채우는 팀
            </Txt>
            <Txt variant="tiny" muted>
              위 A팀 · 아래 B팀
            </Txt>
          </Row>
          <Segmented
            value={side}
            onChange={(next) => {
              setSide(next);
              setSelected(null);
            }}
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
            top={{
              side: 'A',
              slots: slotsBySide.A,
              label: `A팀 ${short(findFormation(formationIds.A).label)}`,
            }}
            bottom={{
              side: 'B',
              slots: slotsBySide.B,
              label: `B팀 ${short(findFormation(formationIds.B).label)}`,
            }}
            members={members}
            selected={selected}
            onSelectSlot={handleSlotPress}
          />

          <Txt variant="tiny" muted>
            자리를 누른 뒤 아래 이름을 누르면 배치돼요. 같은 팀에서 자리 두 곳을 차례로 누르면
            서로 바뀌고, 다른 팀 자리를 누르면 그 팀을 채우는 것으로 넘어가요.
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
              label={`${side}팀 비우기`}
              tone="neutral"
              small
              style={{ flex: 1 }}
              onPress={() =>
                updateSlots(side, (prev) => prev.map((slot) => ({ ...slot, memberId: null })))
              }
            />
            <Button
              label={unsaved.length ? `${unsaved.join('·')}팀 저장하기` : '저장했어요'}
              small
              style={{ flex: 1 }}
              disabled={unsaved.length === 0}
              onPress={async () => {
                // 두 팀을 같이 짜니 저장도 같이 한다. 손댄 쪽만 올린다.
                for (const which of unsaved) {
                  await saveLineup({
                    matchId: match.id,
                    quarter,
                    side: which,
                    formationId: formationIds[which],
                    slots: slotsBySide[which],
                    photoUri: savedBySide[which]?.photoUri ?? null,
                    photoPath: savedBySide[which]?.photoPath ?? null,
                  });
                }
                setDirty({ A: false, B: false });
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
  );
}

/** 판 가운데 띠에는 "3-3-1"까지만. 인원 규격은 위 칩에 이미 보인다. */
function short(label: string): string {
  return label.replace(/\s*\(.*\)$/, '');
}

function toEmpty(slot: Omit<LineupSlot, 'memberId'>): LineupSlot {
  return { ...slot, memberId: null };
}
