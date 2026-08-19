import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { MAX_QUARTERS, useStore } from '@/lib/store';
import { availableMembers, fairnessOrder, memberMap, playingTime, quartersForMatch } from '@/lib/selectors';
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
  Stepper,
  Txt,
  space,
} from '@/components/ui';
import { MatchPicker } from '@/components/MatchPicker';
import { QuickInputFab } from '@/components/QuickInputFab';
import { usePalette } from '@/theme';
import type { LineupSlot } from '@/lib/types';

export default function LineupScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const saveLineup = useStore((state) => state.saveLineup);
  const setQuarters = useStore((state) => state.setQuarters);

  const saved = data?.lineups.find((row) => row.matchId === activeMatchId) ?? null;
  const [formationId, setFormationId] = useState(saved?.formationId ?? DEFAULT_FORMATION.id);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [slots, setSlots] = useState<LineupSlot[]>(saved?.slots ?? DEFAULT_FORMATION.slots.map(toEmpty));
  const [dirty, setDirty] = useState(false);

  const available = useMemo(
    () => (data && activeMatchId ? availableMembers(data, activeMatchId) : []),
    [data, activeMatchId],
  );

  // 경기를 바꾸면 저장된 라인업을 다시 불러온다.
  // 저장된 게 없고 참석자가 정해져 있으면 그 인원에 맞는 규격으로 시작한다 — 조기축구는 인원이
  // 안 맞는 날이 절반이라 11인제로 열어 두면 매번 규격부터 바꿔야 한다.
  // 아직 아무도 답하지 않았으면 인원을 짐작하지 않는다. 0명을 8인제로 읽으면 안 된다.
  useEffect(() => {
    if (saved) {
      setFormationId(saved.formationId);
      setSlots(saved.slots);
    } else {
      const fit =
        (available.length > 0
          ? formationsForSize(sizeForCount(available.length))[0]
          : undefined) ?? DEFAULT_FORMATION;
      setFormationId(fit.id);
      setSlots(fit.slots.map(toEmpty));
    }
    setSelectedKey(null);
    setDirty(false);
    // saved 객체 자체가 아니라 경기 id 기준으로만 초기화한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchId]);

  const members = useMemo(() => memberMap(data?.members ?? []), [data?.members]);
  const playedHere = useMemo(
    () => (data && activeMatchId ? quartersForMatch(data, activeMatchId) : new Map<string, number>()),
    [data, activeMatchId],
  );
  const recentTime = useMemo(
    () => (data ? new Map(playingTime(data, 6, activeMatchId ?? undefined).map((row) => [row.member.id, row])) : new Map()),
    [data, activeMatchId],
  );

  if (!data) return null;
  const match = data.matches.find((item) => item.id === activeMatchId);

  const formation = findFormation(formationId);
  const assignedIds = new Set(slots.map((slot) => slot.memberId).filter(Boolean) as string[]);
  const bench = available.filter((member) => !assignedIds.has(member.id));
  // 아직 아무도 답을 안 했으면 추천하지 않는다. 참석 0명은 "8인제"가 아니라 "모른다"이다.
  const recommendedSize = available.length > 0 ? sizeForCount(available.length) : null;

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

  /** 슬롯을 두 번 누르면 자리 교체, 벤치 선수를 누르면 배치. */
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
      // 선택된 자리가 없으면 선수의 선호 포지션에서 빈 자리를 찾는다.
      slots.find(
        (slot) => !slot.memberId && slot.group === members.get(memberId)?.preferredPosition,
      )?.key ??
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

  /**
   * 빈 자리를 채운다. 순서는 최근에 덜 뛴 사람부터다.
   *
   * 조기축구 라인업에서 실제로 말이 나오는 건 포메이션이 아니라 "누가 더 뛰었나"다.
   * 앞에서부터 넣으면 명단 순서가 곧 서열이 되어 버린다.
   */
  function autoFill() {
    if (!data) return;
    const pool = fairnessOrder(data, available, activeMatchId ?? undefined).filter(
      (member) => !assignedIds.has(member.id),
    );
    const next = slots.map((slot) => {
      if (slot.memberId) return slot;
      // 선호 포지션이 맞는 사람을 먼저 보되, 없으면 순서대로 넣는다.
      const exact = pool.findIndex((member) => member.preferredPosition === slot.group);
      const index = exact >= 0 ? exact : 0;
      const picked = pool.length ? pool.splice(index, 1)[0] : null;
      return { ...slot, memberId: picked?.id ?? null };
    });
    setSlots(next);
    setDirty(true);
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
            {/* 인원 규격을 먼저 고르고, 그 안에서 포메이션을 고른다. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {FORMATION_SIZES.map((size) => (
                <Chip
                  key={size}
                  label={`${size}인${size === recommendedSize ? ' · 추천' : ''}`}
                  selected={size === formation.size}
                  onPress={() => {
                    const next = formationsForSize(size)[0];
                    if (next) changeFormation(next.id);
                  }}
                />
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {formationsForSize(formation.size).map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  selected={option.id === formationId}
                  onPress={() => changeFormation(option.id)}
                />
              ))}
            </ScrollView>

            <Pitch slots={slots} members={members} selectedKey={selectedKey} onSelectSlot={handleSlotPress} />

            <Txt variant="tiny" muted>
              {available.length > 0
                ? `참석 ${available.length}명이에요. `
                : '아직 참석 답이 없어요. 참석 탭에서 먼저 집계하면 인원에 맞는 규격을 추천해요. '}
              자리를 누른 뒤 아래 선수를 누르면 배치돼요. 자리 두 곳을 차례로 누르면 서로 바뀌어요.
            </Txt>

            <Row gap={space.sm}>
              <Button label="덜 뛴 사람부터 채우기" tone="neutral" small style={{ flex: 1 }} onPress={autoFill} />
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
            </Row>

            <SectionHeader title={`대기 (${bench.length}명)`} />
            <Card>
              {available.length === 0 ? (
                <Empty text={'참석으로 표시된 인원이 없어요.\n참석 탭에서 먼저 집계해 주세요.'} />
              ) : bench.length === 0 ? (
                <Empty text="참석자 전원을 배치했어요." />
              ) : (
                <Row wrap gap={space.sm}>
                  {fairnessOrder(data, bench, activeMatchId ?? undefined).map((member) => {
                    const time = recentTime.get(member.id);
                    const hint = time?.perMatch != null ? `${time.perMatch.toFixed(1)}쿼터` : '기록 없음';
                    return (
                      <Chip
                        key={member.id}
                        label={`${member.name}${member.preferredPosition ? ` · ${member.preferredPosition}` : ''} · ${hint}`}
                        onPress={() => assign(member.id)}
                      />
                    );
                  })}
                </Row>
              )}
            </Card>

            <Button
              label={dirty ? '라인업 저장하기' : '저장했어요'}
              disabled={!dirty}
              onPress={async () => {
                await saveLineup({
                  matchId: match.id,
                  formationId,
                  slots,
                  benchMemberIds: bench.map((member) => member.id),
                });
                setDirty(false);
              }}
            />

            <ShareLineup
              teamName={data.team.name}
              match={match}
              formationId={formationId}
              slots={slots}
              members={members}
              bench={bench}
            />

            <SectionHeader title="출전 쿼터" />
            <Card style={{ padding: space.sm, gap: 0 }}>
              <Txt variant="tiny" muted style={{ paddingHorizontal: space.sm, paddingBottom: space.sm }}>
                경기 끝나고 몇 쿼터씩 뛰었는지 눌러 두면, 다음 주 &ldquo;덜 뛴 사람부터 채우기&rdquo;가
                이 기록을 봐요. 최근 6경기 평균이 옆에 보여요.
              </Txt>
              {available.length === 0 ? (
                <Empty text="참석자가 정해지면 여기서 셀 수 있어요." />
              ) : (
                available.map((member, index) => {
                  const time = recentTime.get(member.id);
                  return (
                    <View key={member.id}>
                      {index > 0 ? <Divider /> : null}
                      <Row justify="space-between" style={{ padding: space.sm }}>
                        <View style={{ flexShrink: 1 }}>
                          <Txt variant="body">{member.name}</Txt>
                          <Txt variant="tiny" muted>
                            {time?.perMatch != null
                              ? `최근 평균 ${time.perMatch.toFixed(1)}쿼터`
                              : '최근 출전 기록 없음'}
                          </Txt>
                        </View>
                        <Stepper
                          value={playedHere.get(member.id) ?? 0}
                          max={MAX_QUARTERS}
                          suffix="쿼터"
                          onChange={(next) => setQuarters(match.id, member.id, next)}
                          accessibilityLabel={`${member.name} 출전 쿼터`}
                        />
                      </Row>
                    </View>
                  );
                })
              )}
            </Card>

            <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
              &ldquo;4-3-3으로 가고 골키퍼 병준이형, 수비 도현 성우…&rdquo; 처럼 적거나, 화이트보드 작전판을
              찍어서 올려도 그대로 배치돼요. &ldquo;1쿼터 병준이형 빼고 도현&rdquo; 처럼 적으면 쿼터도 세어져요.
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
