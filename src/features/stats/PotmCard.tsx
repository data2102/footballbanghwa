import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useStore } from '@/lib/store';
import { ballotId } from '@/lib/ballot';
import { availableMembers, potmTally } from '@/lib/selectors';
import { Card, Chip, Divider, Empty, Progress, Row, Txt, space } from '@/components/ui';
import { usePalette } from '@/theme';
import type { AppData } from '@/lib/types';

/**
 * 경기 MVP 투표.
 *
 * 누가 누구를 찍었는지는 저장하지 않는다. 동호회에서 그게 드러나면 다음 주 분위기가
 * 달라지고, 그 위험을 감수할 만큼 재미있는 기능이 아니다. 집계만 보여 준다.
 *
 * FootballLab 처럼 실력에 1~9점을 매기는 방식은 넣지 않았다. 한 명을 고르는 것과
 * 모두에게 점수를 매기는 것은 팀에 남기는 자국이 다르다.
 */
export function PotmCard({ data, matchId }: { data: AppData; matchId: string }) {
  const p = usePalette();
  const togglePotmVote = useStore((state) => state.togglePotmVote);
  const [ballot, setBallot] = useState<string | null>(null);

  useEffect(() => {
    ballotId().then(setBallot);
  }, []);

  const candidates = availableMembers(data, matchId);
  const tally = potmTally(data, matchId);
  const total = tally.reduce((sum, row) => sum + row.votes, 0);
  const mine = ballot
    ? data.potmVotes.find((row) => row.matchId === matchId && row.ballot === ballot)
    : undefined;

  const top = tally[0];
  const tied = tally.length > 1 && tally[1].votes === top?.votes;

  return (
    <Card>
      <Txt variant="h3">이 경기 MVP</Txt>
      <Txt variant="tiny" muted>
        한 명만 고를 수 있어요. 누가 찍었는지는 저장하지 않아요. 다시 누르면 취소돼요.
      </Txt>

      {candidates.length === 0 ? (
        <Empty text={'참석자가 정해지면 투표할 수 있어요.'} />
      ) : (
        <Row wrap gap={space.sm}>
          {candidates.map((member) => (
            <Chip
              key={member.id}
              label={member.name}
              selected={mine?.memberId === member.id}
              onPress={() => togglePotmVote(matchId, member.id)}
            />
          ))}
        </Row>
      )}

      {total > 0 ? (
        <>
          <Divider />
          <Txt variant="small" muted>
            {total}표
            {top && !tied ? ` · 지금은 ${top.member.name}` : top ? ' · 아직 동률이에요' : ''}
          </Txt>
          <View style={{ gap: space.sm }}>
            {tally.map((row) => (
              <View key={row.member.id} style={{ gap: 4 }}>
                <Row justify="space-between">
                  <Txt variant="small">{row.member.name}</Txt>
                  <Txt variant="small" muted tabular>
                    {row.votes}표
                  </Txt>
                </Row>
                <Progress value={row.votes / total} />
              </View>
            ))}
          </View>
        </>
      ) : (
        <Txt variant="tiny" color={p.textFaint}>
          아직 표가 없어요.
        </Txt>
      )}
    </Card>
  );
}
