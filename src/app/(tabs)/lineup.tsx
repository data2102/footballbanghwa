import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MAX_QUARTERS, DEFAULT_QUARTERS, useStore } from '@/lib/store';
import { availableMembers, memberMap, playsPosition, quarterPlay } from '@/lib/selectors';
import { pickPhoto } from '@/lib/photo';
import { handOffPhotos } from '@/lib/photoHandoff';
import {
  DEFAULT_FORMATION,
  FORMATIONS,
  emptySlot,
  findFormation,
  formationsForSize,
  sizeForCount,
} from '@/features/lineup/formations';
import { GuestTag, Pitch } from '@/features/lineup/Pitch';
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
import { Icon } from '@/components/icons';
import { MatchPicker } from '@/components/MatchPicker';
import { PhotoViewer } from '@/components/PhotoViewer';
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
 * **사진도 같은 이유로 한 장이다.** 화이트보드 한 장에 두 팀이 다 있으니 A팀 사진과
 * B팀 사진을 따로 받으면 같은 사진을 두 번 올리게 된다. 쿼터마다 한 장만 받는다.
 *
 * 자리를 누르면 그 팀이 "지금 채우는 팀"이 되고, 배치할 때 그 팀으로 들어간다.
 *
 * 앱에서 라인업을 "짜는" 게 아니다. 이미 화이트보드에서 짜고 왔다. 여기서 하는 일은
 * 그걸 옮겨 담아서 "누가 몇 번, 몇 쿼터에 뛰었나"를 셀 수 있게 만드는 것이다.
 */

/**
 * 포메이션 고르는 줄에 쓰는 차례. 11인이 먼저다 — 인원이 모자란 날에만 아래로 내려간다.
 * 여기에 한 줄 더하면 두 팀 모두에 바로 뜬다(`FORMATIONS`).
 */
const FORMATION_OPTIONS = [...FORMATIONS].sort((a, b) => b.size - a.size);

/**
 * 지금 쓰는 인원 규격을 줄 맨 앞으로 당긴다.
 *
 * 8인제로 잡힌 날에 11인 포메이션이 앞을 다 차지하면 **지금 고른 것이 화면 밖에 있다** —
 * 무엇이 켜져 있는지 안 보여서 옆으로 밀어 봐야 안다. 규격이 같은 것끼리는 차례를 지킨다.
 */
function optionsFor(size: number) {
  return [...FORMATION_OPTIONS].sort(
    (a, b) => (a.size === size ? 0 : 1) - (b.size === size ? 0 : 1),
  );
}

const SIDES: LineupSide[] = ['A', 'B'];

/** 같은 횟수끼리는 이 차례로 묶는다. 골키퍼부터 앞으로 — 화이트보드에 적는 차례와 같다. */
const GROUP_ORDER: PositionGroup[] = ['GK', 'DF', 'MF', 'FW'];

export default function LineupScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const saveLineup = useStore((state) => state.saveLineup);
  const setLineupPhoto = useStore((state) => state.setLineupPhoto);
  /*
   * 쿼터는 스토어에 둔다. 화이트보드 사진 화면이 "몇 쿼터에 넣을지"를 알아야 하는데,
   * 사진은 메모리로 건네주므로 주소에 실을 수 없다.
   */
  const quarter = useStore((state) => state.activeQuarter);
  const setQuarter = useStore((state) => state.setActiveQuarter);
  /** 이름을 눌렀을 때 들어갈 팀. 자리를 누르면 그쪽으로 옮겨 간다. */
  const [side, setSide] = useState<LineupSide>('A');
  const [formationIds, setFormationIds] = useState<Record<LineupSide, string>>({
    A: DEFAULT_FORMATION.id,
    B: DEFAULT_FORMATION.id,
  });
  const [slotsBySide, setSlotsBySide] = useState<Record<LineupSide, LineupSlot[]>>({
    A: DEFAULT_FORMATION.slots.map(emptySlot),
    B: DEFAULT_FORMATION.slots.map(emptySlot),
  });
  const [selected, setSelected] = useState<{ side: LineupSide; key: string } | null>(null);
  const [dirty, setDirty] = useState<Record<LineupSide, boolean>>({ A: false, B: false });
  const [busy, setBusy] = useState(false);
  /** 눌렀는데 아무 일도 안 일어날 때 왜 그런지 말해 준다. */
  const [notice, setNotice] = useState<string | null>(null);
  /** 화이트보드 원본을 화면 가득 띄웠는지. 자석 글씨는 미리보기로는 안 읽힌다. */
  const [viewing, setViewing] = useState(false);

  const savedBySide = useMemo(() => {
    const find = (which: LineupSide) =>
      data?.lineups.find(
        (row) => row.matchId === activeMatchId && row.quarter === quarter && row.side === which,
      ) ?? null;
    return { A: find('A'), B: find('B') };
  }, [data?.lineups, activeMatchId, quarter]);

  /**
   * 이 쿼터의 화이트보드 사진. 새로 올리는 건 항상 A팀 줄에 붙이지만,
   * 예전에 B팀 쪽에 올려 둔 사진이 있으면 그것도 보여 준다 — 안 보이면 없어진 줄 안다.
   */
  const boardPhoto = savedBySide.A?.photoUri ?? savedBySide.B?.photoUri ?? null;

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
        : { id: fit.id, slots: fit.slots.map(emptySlot) };
    const a = load(savedBySide.A);
    const b = load(savedBySide.B);
    setFormationIds({ A: a.id, B: b.id });
    setSlotsBySide({ A: a.slots, B: b.slots });
    setSelected(null);
    setNotice(null);
    setDirty({ A: false, B: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchId, quarter, savedBySide.A?.id, savedBySide.B?.id]);

  const members = useMemo(() => memberMap(data?.members ?? []), [data?.members]);
  const play = useMemo(
    () => (data && activeMatchId ? quarterPlay(data, activeMatchId) : new Map()),
    [data, activeMatchId],
  );

  if (!data) return null;
  const match = data.matches.find((item) => item.id === activeMatchId);

  const slots = slotsBySide[side];
  const formationId = formationIds[side];
  const other: LineupSide = side === 'A' ? 'B' : 'A';

  const assignedIds = new Set(
    SIDES.flatMap((which) => slotsBySide[which].map((slot) => slot.memberId)).filter(
      Boolean,
    ) as string[],
  );
  const takenByOther = new Set(
    slotsBySide[other].map((slot) => slot.memberId).filter(Boolean) as string[],
  );
  const bench = available.filter((member) => !assignedIds.has(member.id));
  /** 아직 안 올린 팀. 둘 다 손댔으면 한 번에 올린다. */
  const unsaved = SIDES.filter((which) => dirty[which]);

  /** 지금 이 쿼터에 어디 서 있는가. "A팀 DF2" 처럼 자리까지 보여 준다. */
  const spotOf = new Map<string, string>();
  /** 용병은 회원 id 가 없다. 판에 적힌 이름이 곧 열쇠다. */
  const guestSpotOf = new Map<string, string>();
  for (const which of SIDES) {
    for (const slot of slotsBySide[which]) {
      if (slot.memberId) spotOf.set(slot.memberId, `${which}팀 ${slot.key}`);
      else if (slot.guestName) guestSpotOf.set(slot.guestName, `${which}팀 ${slot.key}`);
    }
  }

  /**
   * 이 경기에 판으로 들어온 용병들과 뛴 쿼터 수.
   *
   * 회원이 아니라 참석·회비에는 없지만 **출전 명단에서는 보여야 한다.** 안 보이면
   * 한 자리를 쓴 사람이 화면에서 사라져서, 덜 뛴 순이 실제와 어긋난다.
   */
  const guestQuarters = new Map<string, number>();
  for (const row of data.lineups) {
    if (row.matchId !== activeMatchId) continue;
    const names = new Set(
      row.slots.map((slot) => slot.guestName).filter((name): name is string => Boolean(name)),
    );
    for (const name of names) guestQuarters.set(name, (guestQuarters.get(name) ?? 0) + 1);
  }
  for (const name of guestSpotOf.keys()) {
    if (!guestQuarters.has(name)) guestQuarters.set(name, 0);
  }

  /**
   * 대기와 출전을 한 목록으로 본다.
   *
   * 예전에는 "대기" 칩 묶음과 "이 경기 출전" 표가 따로 있었는데, 배정할 사람을 고르려면
   * 두 곳을 번갈아 봐야 했다 — 덜 뛴 사람이 대기에 있는지는 위쪽에서 안 보인다.
   * 한 줄에 이름·연령대·포지션·뛴 횟수를 같이 놓고 **덜 뛴 순**으로 세운다.
   * 맨 위가 다음에 넣을 사람이다.
   */
  type RosterRow = {
    id: string;
    name: string;
    /** 회원이 아닌 사람. 이름 왼쪽에 N 이 붙는다. */
    guest: boolean;
    count: number;
    spot: string | null;
    band: string;
    positions: string;
    group: PositionGroup;
  };

  const roster: RosterRow[] = available
    .map((member) => {
      const count = (play.get(member.id)?.quarters ?? []).length;
      return {
        id: member.id,
        name: member.name,
        guest: false,
        count,
        spot: spotOf.get(member.id) ?? null,
        band: member.ageBand ? `${member.ageBand}대` : '연령대 모름',
        positions: member.positions.length ? member.positions.join('·') : '포지션 미정',
        group: (member.positions[0] ?? 'MF') as PositionGroup,
      };
    })
    .concat(
      [...guestQuarters].map(([name, count]) => ({
        id: `guest:${name}`,
        name,
        guest: true,
        count,
        spot: guestSpotOf.get(name) ?? null,
        band: '용병',
        positions: '명단에 없어요',
        group: 'MF' as PositionGroup,
      })),
    )
    // 덜 뛴 순이 먼저다. 같은 횟수 안에서는 포지션끼리 붙여 놓는다 —
    // 다음에 넣을 사람을 고를 때 "이 자리에 넣을 사람"을 한 덩어리로 보게 된다.
    .sort(
      (a, b) =>
        a.count - b.count ||
        GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
        a.name.localeCompare(b.name, 'ko'),
    );

  /** 지금 채우는 팀의 자리들만 바꾼다. */
  function updateSlots(which: LineupSide, next: (prev: LineupSlot[]) => LineupSlot[]) {
    setSlotsBySide((prev) => ({ ...prev, [which]: next(prev[which]) }));
    setDirty((prev) => ({ ...prev, [which]: true }));
  }

  function changeFormation(which: LineupSide, nextId: string) {
    const next = findFormation(nextId);
    // 포메이션을 바꿔도 이미 배치한 선수는 그룹별로 최대한 유지한다.
    updateSlots(which, (prev) => {
      const pool = prev.filter((slot) => slot.memberId || slot.guestName);
      return next.slots.map((slot) => {
        const index = pool.findIndex((candidate) => candidate.group === slot.group);
        const taken = index >= 0 ? pool.splice(index, 1)[0] : null;
        return { ...emptySlot(slot), memberId: taken?.memberId ?? null, guestName: taken?.guestName ?? null };
      });
    });
    setFormationIds((prev) => ({ ...prev, [which]: nextId }));
    setSide(which);
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

  /** 이미 이 팀에 서 있는 사람을 다시 누르면 뺀다. 그래야 목록 하나로 넣고 뺄 수 있다. */
  function toggle(memberId: string) {
    setNotice(null);
    const here = slotsBySide[side].some((slot) => slot.memberId === memberId);
    if (here && !selected) {
      updateSlots(side, (prev) =>
        prev.map((slot) => (slot.memberId === memberId ? { ...slot, memberId: null } : slot)),
      );
      return;
    }
    assign(memberId);
  }

  /**
   * 용병은 이름을 다시 넣을 길이 없다(명단에 없다). 그래서 지금 채우는 팀에 서 있으면
   * 빼기만 하고, 아니면 어디서 들어오는 건지 말해 준다 — 조용히 넘어가면 앱이 멈춘 줄 안다.
   */
  function removeGuest(name: string) {
    const here = slotsBySide[side].some((slot) => slot.guestName === name);
    if (!here) {
      setNotice(`${name} 님은 용병이라 화이트보드 사진에서만 들어와요. 자리를 눌러 바꿔 주세요.`);
      return;
    }
    setNotice(null);
    updateSlots(side, (prev) =>
      prev.map((slot) => (slot.guestName === name ? { ...slot, guestName: null } : slot)),
    );
  }

  function assign(memberId: string) {
    const member = members.get(memberId);
    const targetKey =
      (selected?.side === side ? selected.key : null) ??
      // 고른 자리가 없으면 이 사람이 볼 수 있는 빈 자리를 먼저 찾는다.
      // 용병이 선 자리는 빈 자리가 아니다 — 자동으로 밀어내면 그 사람이 조용히 사라진다.
      slots.find(
        (slot) => !slot.memberId && !slot.guestName && member && playsPosition(member, slot.group),
      )?.key ?? slots.find((slot) => !slot.memberId && !slot.guestName)?.key;
    // 자리가 다 찼는데 조용히 넘어가면 사용자는 앱이 멈춘 줄 안다.
    if (!targetKey) {
      setNotice(`${side}팀 자리가 다 찼어요. 바꿀 자리를 먼저 누른 뒤에 이름을 눌러 주세요.`);
      return;
    }
    updateSlots(side, (prev) =>
      prev.map((slot) => {
        if (slot.key === targetKey) return { ...slot, memberId, guestName: null };
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

  /**
   * 사진을 여기서 고르고 읽는 화면으로 넘긴다.
   *
   * 여는 것을 버튼 쪽에서 하는 이유는 브라우저다 — **사용자가 누른 그 순간이 아니면**
   * 사진첩을 안 열어 준다. 화면을 먼저 띄우고 거기서 다시 누르게 하면 한 번 더 눌러야 한다.
   */
  async function attachPhoto(source: 'camera' | 'library') {
    if (!match) return;
    setBusy(true);
    try {
      // 판은 자르면 안 된다. 위가 A팀 아래가 B팀인데, 가로로 자르면 그 구분이 사라진다.
      const photo = await pickPhoto(source, { whole: true });
      if (!photo) return;
      handOffPhotos([photo]);
      router.push('/lineup-photo');
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
          {/* 쿼터부터 좁혀 간다. 화이트보드를 읽는 순서와 같다. */}
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

          {/* 화이트보드 사진이 원본이다. 한 장에 두 팀이 다 들어 있다. */}
          <Card>
            <Row justify="space-between">
              <Txt variant="h3">{quarter}쿼터 화이트보드</Txt>
              {boardPhoto ? (
                <Txt variant="tiny" color={p.ok}>
                  사진 있어요
                </Txt>
              ) : null}
            </Row>

            {boardPhoto ? (
              <>
                {/*
                  사진이 그 쿼터에 누가 뛰었는지의 원본이다. 앱이 읽어 낸 이름과 대조하려면
                  자석 글씨가 읽혀야 하는데 카드 안 미리보기로는 어림도 없다 — 눌러서 키운다.
                */}
                <Pressable
                  onPress={() => setViewing(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${quarter}쿼터 화이트보드 사진 크게 보기`}
                >
                  <Image
                    source={{ uri: boardPhoto }}
                    resizeMode="contain"
                    style={{
                      width: '100%',
                      aspectRatio: 3 / 4,
                      borderRadius: radius.md,
                      backgroundColor: p.surfaceAlt,
                    }}
                  />
                  <Row gap={space.xs} style={{ marginTop: space.xs, justifyContent: 'center' }}>
                    <Icon name="image" size={12} color={p.textMuted} />
                    <Txt variant="tiny" muted>
                      눌러서 크게 보기
                    </Txt>
                  </Row>
                </Pressable>
              </>
            ) : (
              <Txt variant="tiny" muted>
                화이트보드를 한 장으로 찍어 올리면 자석 이름을 읽어서 이 쿼터 출전을 한 번씩
                체크해요. 사진은 그대로 남아 언제든 다시 볼 수 있어요.
              </Txt>
            )}

            <Row gap={space.sm}>
              <Button
                label={boardPhoto ? '다시 찍기' : '사진 찍기'}
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

          {/*
            포메이션은 팀마다 따로 고른다. 자체경기라 A팀은 4-3-3, B팀은 4-4-2 인 날이 흔하다.
            고르면 그 팀이 지금 채우는 팀이 되고, 전술판의 자리도 그 모양으로 다시 그려진다.
          */}
          {SIDES.map((which) => (
            <View key={which} style={{ gap: space.xs }}>
              <Row justify="space-between">
                <Txt variant="tiny" muted>
                  {which}팀 포메이션
                </Txt>
                <Txt variant="tiny" muted>
                  {findFormation(formationIds[which]).size}명 자리
                </Txt>
              </Row>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space.sm }}
              >
                {optionsFor(findFormation(formationIds[which]).size).map((option) => (
                  <Chip
                    key={option.id}
                    label={option.label}
                    selected={option.id === formationIds[which]}
                    onPress={() => changeFormation(which, option.id)}
                  />
                ))}
              </ScrollView>
            </View>
          ))}

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

          {/* 이름을 누르면 어디로 들어가는지 여기서 정한다. 자리를 누르면 따라 바뀐다. */}
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
              setNotice(null);
            }}
            options={[
              { value: 'A' as LineupSide, label: 'A팀' },
              { value: 'B' as LineupSide, label: 'B팀' },
            ]}
          />

          <Row gap={space.sm}>
            <Button
              label={`${side}팀 비우기`}
              tone="neutral"
              small
              style={{ flex: 1 }}
              onPress={() =>
                updateSlots(side, (prev) => prev.map((slot) => ({ ...slot, memberId: null, guestName: null })))
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

          {/*
            대기와 출전을 한 목록으로 본다. 맨 위가 이 경기에서 제일 덜 뛴 사람이다.
            누르면 지금 채우는 팀으로 들어가고, 그 팀에 이미 서 있으면 빠진다.
          */}
          <SectionHeader title={`출전 명단 (${roster.length}명)`} />
          <Txt variant="tiny" color={notice ? p.warn : undefined} muted={!notice}>
            {notice ??
              '덜 뛴 순이에요. 같은 횟수는 포지션끼리 묶었어요. 자리를 먼저 누르면 그 자리에 들어가요.'}
          </Txt>
          <Card style={{ padding: space.sm, gap: 0 }}>
            {roster.length === 0 ? (
              <Empty text={'참석으로 표시된 인원이 없어요.\n참석 탭에서 먼저 집계해 주세요.'} />
            ) : (
              roster.map((row, index) => {
                const here = row.spot?.startsWith(side) ?? false;
                return (
                  <View key={row.id}>
                    {index > 0 ? <Divider /> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${row.guest ? '용병 ' : ''}${row.name} ${row.spot ?? '대기'}`}
                      onPress={() => (row.guest ? removeGuest(row.name) : toggle(row.id))}
                      style={({ pressed }) => ({
                        paddingVertical: space.sm,
                        paddingHorizontal: space.sm,
                        borderRadius: radius.sm,
                        backgroundColor: here ? p.primarySoft : pressed ? p.surfaceAlt : undefined,
                      })}
                    >
                      <Row justify="space-between">
                        <View style={{ flexShrink: 1, gap: 2 }}>
                          <Row gap={space.xs}>
                            {row.guest ? <GuestTag /> : null}
                            <Txt variant="body" style={{ flexShrink: 1 }}>
                              {row.name}
                            </Txt>
                          </Row>
                          <Txt variant="tiny" muted>
                            {row.band} · {row.positions}
                          </Txt>
                        </View>
                        <Row gap={space.sm}>
                          <Txt
                            variant="tiny"
                            color={row.spot ? p.primaryStrong : p.textMuted}
                            style={{ textAlign: 'right' }}
                          >
                            {row.spot ?? '대기'}
                          </Txt>
                          <Txt
                            variant="h3"
                            tabular
                            color={row.count === 0 ? p.danger : p.text}
                            style={{ minWidth: 26, textAlign: 'right' }}
                          >
                            {row.count}
                          </Txt>
                        </Row>
                      </Row>
                    </Pressable>
                  </View>
                );
              })
            )}
          </Card>

          <ShareLineup
            teamName={data.team.name}
            match={match}
            formationId={formationId}
            slots={slots}
            members={members}
            bench={bench}
          />

          <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
            오른쪽 숫자가 이 경기에서 뛴 쿼터 수예요. 화이트보드를 올릴 때마다 다시 세요.
          </Txt>

          {viewing ? (
            <PhotoViewer
              uri={boardPhoto}
              title={`${quarter}쿼터 화이트보드`}
              onClose={() => setViewing(false)}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** 판 가운데 띠에는 "3-3-1"까지만. 인원 규격은 위 칩에 이미 보인다. */
function short(label: string): string {
  return label.replace(/\s*\(.*\)$/, '');
}
