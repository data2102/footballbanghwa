import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MAX_QUARTERS, DEFAULT_QUARTERS, useStore } from '@/lib/store';
import { availableMembers, memberMap, playsPosition, quarterPlay } from '@/lib/selectors';
import { wakeAiServer } from '@/lib/ai/aiFetch';
import { pickPhoto } from '@/lib/photo';
import { handOffPhotos } from '@/lib/photoHandoff';
import { DEFAULT_FORMATION, emptySlot, formationFromGroups } from '@/features/lineup/formations';
import { GuestTag } from '@/features/lineup/GuestTag';
import { ShareLineup } from '@/features/lineup/ShareLineup';
import {
  Button,
  Card,
  Chip,
  Empty,
  Row,
  Screen,
  SectionHeader,
  Txt,
  radius,
  space,
} from '@/components/ui';
import { Icon } from '@/components/icons';
import { MatchPicker } from '@/components/MatchPicker';
import { PhotoViewer } from '@/components/PhotoViewer';
import { usePalette } from '@/theme';
import type { AgeBand, LineupSide, LineupSlot, PositionGroup } from '@/lib/types';

/**
 * 출전.
 *
 * **이 화면은 라인업을 짜는 곳이 아니다.** 라인업은 이미 운동장 화이트보드에서 짜고 왔다.
 * 여기서 하는 일은 그 판 사진을 올려서 "누가 몇 쿼터를 뛰었나"를 세는 것 하나다.
 *
 * 그래서 포메이션 고르는 줄도, 전술판도 두지 않는다. 사진 한 장이 그 자리를 대신하고,
 * 사람이 볼 것은 **누가 덜 뛰었나** 하나뿐이다 — 다음 쿼터에 넣을 사람이 그 위에 있다.
 * 판 배치를 다시 보고 싶으면 사진을 눌러 크게 본다. 원본이 제일 정확하다.
 */

const SIDES: LineupSide[] = ['A', 'B'];

/** 같은 횟수 안에서는 나이 많은 분부터. 회원 탭의 연령대 순과 같은 차례다. */
function ageRank(band: AgeBand | null): number {
  return band ? Number(band) : -1;
}

export default function LineupScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const saveLineup = useStore((state) => state.saveLineup);
  /*
   * 쿼터는 스토어에 둔다. 화이트보드 사진 화면이 "몇 쿼터에 넣을지"를 알아야 하는데,
   * 사진은 메모리로 건네주므로 주소에 실을 수 없다.
   */
  const quarter = useStore((state) => state.activeQuarter);
  const setQuarter = useStore((state) => state.setActiveQuarter);

  const [slotsBySide, setSlotsBySide] = useState<Record<LineupSide, LineupSlot[]>>({ A: [], B: [] });
  const [formationIds, setFormationIds] = useState<Record<LineupSide, string>>({
    A: DEFAULT_FORMATION.id,
    B: DEFAULT_FORMATION.id,
  });
  const [dirty, setDirty] = useState<Record<LineupSide, boolean>>({ A: false, B: false });
  const [busy, setBusy] = useState(false);
  /** 화이트보드 원본을 화면 가득 띄웠는지. 자석 글씨는 미리보기로는 안 읽힌다. */
  const [viewing, setViewing] = useState(false);

  useEffect(() => {
    /*
     * AI 서버는 무료 플랜이라 15분 놀면 잠든다. 깨는 데 30~60초인데, 사진 고르는 화면에
     * 들어가서야 깨우면 그 시간을 사람이 그대로 기다린다. **탭을 여는 순간** 찔러 두면
     * 날짜 고르고 사진 찾는 동안 일어나 있다.
     */
    wakeAiServer();
  }, []);

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
   */
  const quarterCount = useMemo(() => {
    const used = (data?.lineups ?? [])
      .filter((row) => row.matchId === activeMatchId)
      .map((row) => row.quarter);
    return Math.min(MAX_QUARTERS, Math.max(DEFAULT_QUARTERS, ...used, 0));
  }, [data?.lineups, activeMatchId]);

  // 경기나 쿼터가 바뀌면 저장된 두 팀을 다시 불러온다. 없으면 빈 판이다 —
  // 사진을 올리면 그때 읽은 줄 수대로 자리가 생긴다.
  useEffect(() => {
    setSlotsBySide({ A: savedBySide.A?.slots ?? [], B: savedBySide.B?.slots ?? [] });
    setFormationIds({
      A: savedBySide.A?.formationId ?? DEFAULT_FORMATION.id,
      B: savedBySide.B?.formationId ?? DEFAULT_FORMATION.id,
    });
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

  const assignedIds = new Set(
    SIDES.flatMap((which) => slotsBySide[which].map((slot) => slot.memberId)).filter(
      Boolean,
    ) as string[],
  );
  const bench = available.filter((member) => !assignedIds.has(member.id));
  /** 아직 안 올린 팀. 둘 다 손댔으면 한 번에 올린다. */
  const unsaved = SIDES.filter((which) => dirty[which]);

  /** 지금 이 쿼터에 어느 팀에 서 있는가. */
  const sideOfMember = new Map<string, LineupSide>();
  const sideOfGuest = new Map<string, LineupSide>();
  for (const which of SIDES) {
    for (const slot of slotsBySide[which]) {
      if (slot.memberId) sideOfMember.set(slot.memberId, which);
      else if (slot.guestName) sideOfGuest.set(slot.guestName, which);
    }
  }

  /**
   * 이 경기에 판으로 들어온 용병들과 뛴 쿼터 수.
   * 회원이 아니라 참석·회비에는 없지만 출전 명단에서는 보여야 한다.
   */
  const guestQuarters = new Map<string, number>();
  for (const row of data.lineups) {
    if (row.matchId !== activeMatchId) continue;
    const names = new Set(
      row.slots.map((slot) => slot.guestName).filter((name): name is string => Boolean(name)),
    );
    for (const name of names) guestQuarters.set(name, (guestQuarters.get(name) ?? 0) + 1);
  }
  for (const name of sideOfGuest.keys()) {
    if (!guestQuarters.has(name)) guestQuarters.set(name, 0);
  }

  type Card = {
    id: string;
    name: string;
    guest: boolean;
    count: number;
    side: LineupSide | null;
    band: string;
    rank: number;
    position: string;
  };

  /**
   * 덜 뛴 순으로 세우고, 같은 횟수 안에서는 나이 많은 분부터.
   *
   * 마흔 명을 한 줄씩 늘어놓으면 화면이 너무 길어져서 아래쪽 사람은 스크롤해야 보인다.
   * 세 명씩 한 줄에 놓으면 한 화면에 열두 명이 들어와 "다음에 넣을 사람"이 위에서 다 보인다.
   */
  const roster: Card[] = available
    .map((member): Card => ({
      id: member.id,
      name: member.name,
      guest: false,
      count: (play.get(member.id)?.quarters ?? []).length,
      side: sideOfMember.get(member.id) ?? null,
      band: member.ageBand ? `${member.ageBand}대` : '나이 모름',
      rank: ageRank(member.ageBand),
      position: member.positions[0] ?? '-',
    }))
    .concat(
      [...guestQuarters].map(([name, count]): Card => ({
        id: `guest:${name}`,
        name,
        guest: true,
        count,
        side: sideOfGuest.get(name) ?? null,
        band: '용병',
        rank: -1,
        position: '-',
      })),
    )
    .sort(
      (a, b) => a.count - b.count || b.rank - a.rank || a.name.localeCompare(b.name, 'ko'),
    );

  function updateSlots(which: LineupSide, next: (prev: LineupSlot[]) => LineupSlot[]) {
    setSlotsBySide((prev) => ({ ...prev, [which]: next(prev[which]) }));
    setDirty((prev) => ({ ...prev, [which]: true }));
  }

  /**
   * 한 명을 그 팀에 앉힌다.
   *
   * 빈 자리가 있으면 그 사람이 볼 수 있는 자리부터 쓰고, 자리가 다 찼으면 **한 자리를 더
   * 만든다.** 전술판이 없어졌으니 자리 수를 미리 정해 둘 이유가 없다 — 판에서 읽은 대로
   * 시작해서 사람이 더하는 만큼 늘어난다.
   */
  function place(which: LineupSide, key: { memberId?: string; guestName?: string }) {
    const member = key.memberId ? members.get(key.memberId) : undefined;
    updateSlots(which, (prev) => {
      const free =
        prev.find(
          (slot) =>
            !slot.memberId && !slot.guestName && member && playsPosition(member, slot.group),
        ) ?? prev.find((slot) => !slot.memberId && !slot.guestName);
      if (free) {
        return prev.map((slot) =>
          slot.key === free.key
            ? { ...slot, memberId: key.memberId ?? null, guestName: key.guestName ?? null }
            : slot,
        );
      }

      // 자리를 한 칸 늘려 다시 앉힌다. 그룹 수가 바뀌니 좌표도 같이 다시 잡는다.
      const group = (member?.positions[0] ?? 'MF') as PositionGroup;
      const seated = prev.filter((slot) => slot.memberId || slot.guestName);
      const groups = [...seated.map((slot) => slot.group), group];
      const grown = formationFromGroups(groups).slots.map(emptySlot);
      const pool = [...seated, { group, memberId: key.memberId ?? null, guestName: key.guestName ?? null }];
      return grown.map((slot) => {
        const at = pool.findIndex((one) => one.group === slot.group);
        const taken = at >= 0 ? pool.splice(at, 1)[0] : null;
        return { ...slot, memberId: taken?.memberId ?? null, guestName: taken?.guestName ?? null };
      });
    });
    setFormationIds((prev) => prev);
  }

  function drop(which: LineupSide, key: { memberId?: string; guestName?: string }) {
    updateSlots(which, (prev) =>
      prev.map((slot) =>
        (key.memberId && slot.memberId === key.memberId) ||
        (key.guestName && slot.guestName === key.guestName)
          ? { ...slot, memberId: null, guestName: null }
          : slot,
      ),
    );
  }

  /** 대기 -> A팀 -> B팀 -> 대기. 전술판이 없으니 누르는 것 하나로 팀을 옮긴다. */
  function cycle(card: Card) {
    const key = card.guest ? { guestName: card.name } : { memberId: card.id };
    if (card.side === null) place('A', key);
    else if (card.side === 'A') {
      drop('A', key);
      place('B', key);
    } else drop('B', key);
  }

  /**
   * 사진을 여기서 고르고 읽는 화면으로 넘긴다.
   *
   * 여는 것을 버튼 쪽에서 하는 이유는 브라우저다 — **사용자가 누른 그 순간이 아니면**
   * 사진첩을 안 열어 준다.
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

          {unsaved.length ? (
            <Button
              label={`${unsaved.join('·')}팀 저장하기`}
              onPress={async () => {
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
          ) : null}

          {/*
            누가 덜 뛰었나 — 이 화면에서 사람이 볼 것은 이것 하나다.
            세 명씩 놓아 한 화면에 열두 명이 들어오게 한다.
          */}
          <SectionHeader title={`출전 명단 (${roster.length}명)`} />
          <Txt variant="tiny" muted>
            덜 뛴 순이에요. 같은 횟수는 나이 많은 분부터. 눌러서 대기 → A팀 → B팀으로 바꿔요.
          </Txt>
          {roster.length === 0 ? (
            <Card>
              <Empty text={'참석으로 표시된 인원이 없어요.\n참석 탭에서 먼저 집계해 주세요.'} />
            </Card>
          ) : (
            <Row wrap gap={0} align="stretch">
              {roster.map((card) => (
                <View key={card.id} style={{ width: '33.333%', padding: 3 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${card.guest ? '용병 ' : ''}${card.name} ${card.side ? `${card.side}팀` : '대기'} ${card.count}쿼터`}
                    onPress={() => cycle(card)}
                    style={({ pressed }) => ({
                      minHeight: 62,
                      paddingVertical: space.xs,
                      paddingHorizontal: space.sm,
                      borderRadius: radius.sm,
                      borderWidth: 1,
                      borderColor: card.side ? p.primary : p.border,
                      backgroundColor: card.side
                        ? p.primarySoft
                        : pressed
                          ? p.surfaceAlt
                          : p.surface,
                      gap: 1,
                    })}
                  >
                    <Row justify="space-between" gap={space.xs}>
                      <Row gap={2} style={{ flexShrink: 1 }}>
                        {card.guest ? <GuestTag /> : null}
                        <Txt variant="small" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {card.name}
                        </Txt>
                      </Row>
                      <Txt
                        variant="small"
                        tabular
                        color={card.count === 0 ? p.danger : p.text}
                      >
                        {card.count}
                      </Txt>
                    </Row>
                    <Txt variant="tiny" muted numberOfLines={1}>
                      {`${card.band} · ${card.position}`}
                    </Txt>
                    <Txt
                      variant="tiny"
                      color={card.side ? p.primaryStrong : p.textFaint}
                      numberOfLines={1}
                    >
                      {card.side ? `${card.side}팀` : '대기'}
                    </Txt>
                  </Pressable>
                </View>
              ))}
            </Row>
          )}

          {SIDES.map((which) => (
            <ShareLineup
              key={which}
              teamName={data.team.name}
              side={which}
              match={match}
              formationId={formationIds[which]}
              slots={slotsBySide[which]}
              members={members}
              bench={bench}
            />
          ))}

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
