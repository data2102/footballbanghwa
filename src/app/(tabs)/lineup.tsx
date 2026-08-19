import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useStore } from '@/lib/store';
import { availableMembers, memberMap } from '@/lib/selectors';
import { DEFAULT_FORMATION, FORMATIONS, findFormation } from '@/features/lineup/formations';
import { Pitch } from '@/features/lineup/Pitch';
import {
  Button,
  Card,
  Chip,
  Empty,
  Row,
  Screen,
  SectionHeader,
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

  const saved = data?.lineups.find((row) => row.matchId === activeMatchId) ?? null;
  const [formationId, setFormationId] = useState(saved?.formationId ?? DEFAULT_FORMATION.id);
  const [slots, setSlots] = useState<LineupSlot[]>(saved?.slots ?? DEFAULT_FORMATION.slots.map(toEmpty));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // 경기를 바꾸면 저장된 라인업을 다시 불러온다.
  useEffect(() => {
    const next = saved;
    setFormationId(next?.formationId ?? DEFAULT_FORMATION.id);
    setSlots(next?.slots ?? findFormation(next?.formationId).slots.map(toEmpty));
    setSelectedKey(null);
    setDirty(false);
    // saved 객체 자체가 아니라 경기 id 기준으로만 초기화한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchId]);

  const available = useMemo(
    () => (data && activeMatchId ? availableMembers(data, activeMatchId) : []),
    [data, activeMatchId],
  );
  const members = useMemo(() => memberMap(data?.members ?? []), [data?.members]);

  if (!data) return null;
  const match = data.matches.find((item) => item.id === activeMatchId);

  const assignedIds = new Set(slots.map((slot) => slot.memberId).filter(Boolean) as string[]);
  const bench = available.filter((member) => !assignedIds.has(member.id));

  function changeFormation(nextId: string) {
    const formation = findFormation(nextId);
    // 포메이션을 바꿔도 이미 배치한 선수는 그룹별로 최대한 유지한다.
    const pool = [...slots].filter((slot) => slot.memberId);
    const next = formation.slots.map((slot) => {
      const index = pool.findIndex((candidate) => candidate.group === slot.group);
      const taken = index >= 0 ? pool.splice(index, 1)[0] : null;
      return { ...slot, memberId: taken?.memberId ?? null };
    });
    setFormationId(nextId);
    setSlots(next);
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

  function autoFill() {
    const pool = [...available];
    const next = slots.map((slot) => {
      if (slot.memberId) return slot;
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
            <Empty text="경기를 먼저 만들어 주세요." />
          </Card>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {FORMATIONS.map((formation) => (
                <Chip
                  key={formation.id}
                  label={formation.label}
                  selected={formation.id === formationId}
                  onPress={() => changeFormation(formation.id)}
                />
              ))}
            </ScrollView>

            <Pitch slots={slots} members={members} selectedKey={selectedKey} onSelectSlot={handleSlotPress} />

            <Txt variant="small" muted>
              자리를 누른 뒤 아래 선수를 누르면 배치됩니다. 자리 두 곳을 차례로 누르면 서로 바뀝니다.
            </Txt>

            <Row gap={space.sm}>
              <Button label="참석자로 자동 채우기" tone="neutral" small style={{ flex: 1 }} onPress={autoFill} />
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
                <Empty text={'참석으로 표시된 인원이 없습니다.\n참석 탭에서 먼저 집계해 주세요.'} />
              ) : bench.length === 0 ? (
                <Empty text="참석자 전원이 배치되었습니다." />
              ) : (
                <Row wrap gap={space.sm}>
                  {bench.map((member) => (
                    <Chip
                      key={member.id}
                      label={`${member.name}${member.preferredPosition ? ` · ${member.preferredPosition}` : ''}`}
                      onPress={() => assign(member.id)}
                    />
                  ))}
                </Row>
              )}
            </Card>

            <Button
              label={dirty ? '라인업 저장' : '저장됨'}
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
            <Txt variant="tiny" muted style={{ textAlign: 'center', color: p.textMuted }}>
              &ldquo;4-3-3으로 가고 골키퍼 병준이형, 수비 도현 성우…&rdquo; 처럼 적어서 문자로 입력해도
              그대로 배치됩니다.
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
