import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useStore } from '@/lib/store';
import { formatDate, relativeDay, todayISO } from '@/lib/format';
import { monthGrid, nearestMatchIndex } from '@/lib/schedule';
import { Button, Card, Chip, Row, Txt, radius, space } from '@/components/ui';
import { Icon } from '@/components/icons';
import { usePalette } from '@/theme';

/**
 * 참석·출전·기록 화면이 공유하는 경기 선택 줄.
 *
 * 매주 일요일 경기라 한 해에 쉰 개가 넘는다. 그래서 두 가지가 필요하다 —
 * 오늘 근처가 처음부터 보이게 하는 것과, 몇 달 전으로 한 번에 뛰는 길.
 * 스크롤만 두면 3월 경기를 찾는 데 손가락이 스무 번 간다.
 */

export function MatchPicker() {
  const p = usePalette();
  const matches = useStore((state) => state.data?.matches ?? []);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const setActiveMatch = useStore((state) => state.setActiveMatch);
  const scroller = useRef<ScrollView>(null);
  const scrolledOnce = useRef(false);
  /**
   * 칩마다 실제 x 좌표를 적어 둔다.
   * 폭을 어림해서 계산하면 날짜 글자 길이에 따라 조금씩 밀리고, 쉰 개를 지나면
   * 서너 칸씩 어긋난다 — 실제로 148로 어림했다가 162여서 밀렸다.
   */
  const chipX = useRef<number[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // 왼쪽이 과거, 오른쪽이 미래. 달력을 읽는 방향과 같아야 헷갈리지 않는다.
  const sorted = useMemo(
    () => [...matches].sort((a, b) => a.date.localeCompare(b.date)),
    [matches],
  );
  const activeIndex = sorted.findIndex((match) => match.id === activeMatchId);

  const scrollToIndex = (index: number, animated: boolean) => {
    const x = chipX.current[index];
    if (x == null) return;
    // 한 칸 왼쪽부터 보이게 해서 "앞에도 더 있다"가 드러나게 한다.
    scroller.current?.scrollTo({ x: Math.max(0, x - 90), animated });
  };

  /**
   * 달력에서 고르면 그 경기가 보이는 자리로 줄을 옮긴다.
   * 안 그러면 고른 경기가 화면 밖에 있어서 아무 일도 안 일어난 것처럼 보인다.
   */
  useEffect(() => {
    if (scrolledOnce.current && activeIndex >= 0) scrollToIndex(activeIndex, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchId]);

  if (!sorted.length) return null;

  return (
    <>
      <Row gap={space.sm}>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}
          style={{ flex: 1 }}
          /*
           * 칩이 다 그려진 뒤에야 옮길 수 있다. 그리기 전에 scrollTo 하면 아무 일도 안 일어나서
           * 한 해치가 1월부터 보인다 - 매번 오늘까지 손가락으로 밀어야 한다.
           */
          onContentSizeChange={() => {
            if (scrolledOnce.current) return;
            scrolledOnce.current = true;
            const index = activeIndex >= 0 ? activeIndex : nearestMatchIndex(sorted.map((m) => m.date));
            scrollToIndex(index, false);
          }}
        >
          {sorted.map((match, index) => (
            <View
              key={match.id}
              onLayout={(event) => {
                chipX.current[index] = event.nativeEvent.layout.x;
              }}
            >
              <Chip
                label={`${formatDate(match.date)} · ${relativeDay(match.date)}`}
                selected={match.id === activeMatchId}
                onPress={() => setActiveMatch(match.id)}
              />
            </View>
          ))}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="달력으로 경기 찾기"
          onPress={() => setCalendarOpen(true)}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: p.borderStrong,
            backgroundColor: p.surface,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="calendar" size={19} color={p.textMuted} />
        </Pressable>
      </Row>

      <CalendarSheet
        open={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        matches={sorted}
        activeMatchId={activeMatchId}
        onPick={(id) => {
          setActiveMatch(id);
          setCalendarOpen(false);
        }}
      />
    </>
  );
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

function CalendarSheet({
  open,
  onClose,
  matches,
  activeMatchId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  matches: { id: string; date: string }[];
  activeMatchId: string | null;
  onPick: (id: string) => void;
}) {
  const p = usePalette();
  const active = matches.find((match) => match.id === activeMatchId);
  const start = (active?.date ?? todayISO()).slice(0, 7);
  const [cursor, setCursor] = useState(start);

  // 달력을 다시 열면 지금 보고 있는 경기의 달로 돌아온다.
  useEffect(() => {
    if (open) setCursor(start);
  }, [open, start]);

  const byDate = useMemo(() => new Map(matches.map((match) => [match.date, match.id])), [matches]);
  const [year, month] = cursor.split('-').map(Number);
  const cells = monthGrid(year, month, new Set(byDate.keys()));

  function shift(months: number) {
    const next = new Date(Date.UTC(year, month - 1 + months, 1));
    setCursor(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="달력 닫기"
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          justifyContent: 'center',
          padding: space.lg,
        }}
      >
        {/* 안쪽을 눌렀을 때 닫히지 않게 누름을 막는다. */}
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <Card>
            <Row justify="space-between">
              <Button label="이전 달" tone="neutral" small onPress={() => shift(-1)} />
              <Txt variant="h3">
                {year}년 {month}월
              </Txt>
              <Button label="다음 달" tone="neutral" small onPress={() => shift(1)} />
            </Row>

            <Row>
              {WEEK.map((day, index) => (
                <Txt
                  key={day}
                  variant="tiny"
                  color={index === 0 ? p.danger : p.textFaint}
                  style={{ flex: 1, textAlign: 'center' }}
                >
                  {day}
                </Txt>
              ))}
            </Row>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.map((cell, index) => {
                const id = cell.date ? byDate.get(cell.date) : undefined;
                const selected = Boolean(id) && id === activeMatchId;
                return (
                  <View key={cell.date ?? `pad-${index}`} style={{ width: `${100 / 7}%`, padding: 2 }}>
                    <Pressable
                      disabled={!id}
                      accessibilityRole={id ? 'button' : undefined}
                      accessibilityLabel={cell.date ? `${cell.date}${id ? ' 경기' : ''}` : undefined}
                      onPress={() => id && onPick(id)}
                      style={({ pressed }) => ({
                        height: 40,
                        borderRadius: radius.sm,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: selected ? p.primaryStrong : id ? p.primarySoft : 'transparent',
                        borderWidth: cell.isToday ? 1 : 0,
                        borderColor: p.primary,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Txt
                        variant="small"
                        tabular
                        color={
                          !cell.date
                            ? 'transparent'
                            : selected
                              ? p.onPrimary
                              : id
                                ? p.primaryStrong
                                : p.textDisabled
                        }
                      >
                        {cell.date ? Number(cell.date.slice(-2)) : ''}
                      </Txt>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <Txt variant="tiny" muted style={{ textAlign: 'center' }}>
              파란 날에 경기가 있어요. 눌러서 그 경기로 가요.
            </Txt>
            <Button label="닫기" tone="neutral" onPress={onClose} />
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
