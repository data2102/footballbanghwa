import { ScrollView } from 'react-native';
import { useStore } from '@/lib/store';
import { formatDate, relativeDay } from '@/lib/format';
import { Chip, space } from '@/components/ui';

/** 참석·라인업·기록 화면이 공유하는 경기 선택 줄. */
export function MatchPicker() {
  const matches = useStore((state) => state.data?.matches ?? []);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const setActiveMatch = useStore((state) => state.setActiveMatch);

  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}
    >
      {sorted.map((match) => (
        <Chip
          key={match.id}
          label={`${formatDate(match.date)} · ${relativeDay(match.date)}`}
          selected={match.id === activeMatchId}
          onPress={() => setActiveMatch(match.id)}
        />
      ))}
    </ScrollView>
  );
}
