import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useStore } from '@/lib/store';
import {
  eventsForMatch,
  matchResult,
  memberName,
  playerStats,
  rankings,
  teamRecord,
} from '@/lib/selectors';
import { formatDate } from '@/lib/format';
import {
  Button,
  Card,
  Chip,
  Divider,
  Empty,
  Hero,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Stat,
  Txt,
  space,
} from '@/components/ui';
import { PotmCard } from '@/features/stats/PotmCard';
import { MatchPicker } from '@/components/MatchPicker';
import { QuickInputFab } from '@/components/QuickInputFab';
import { usePalette } from '@/theme';
import type { MatchEventType } from '@/lib/types';
import type { RankingKey } from '@/lib/selectors';

const EVENT_LABEL: Record<MatchEventType, string> = {
  goal: '골',
  assist: '도움',
  save: '선방',
  yellow: '경고',
  red: '퇴장',
  own_goal: '자책',
};

type Scope = 'season' | 'match';

export default function StatsScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);
  const activeMatchId = useStore((state) => state.activeMatchId);
  const removeEvent = useStore((state) => state.removeEvent);
  const [scope, setScope] = useState<Scope>('season');
  const [board, setBoard] = useState<RankingKey>('points');

  const stats = useMemo(
    () =>
      data
        ? playerStats(data, scope === 'match' && activeMatchId ? new Set([activeMatchId]) : undefined)
        : [],
    [data, scope, activeMatchId],
  );

  const boards = useMemo(() => (data ? rankings(data) : []), [data]);
  const record = useMemo(() => (data ? teamRecord(data) : null), [data]);

  if (!data) return null;
  const match = data.matches.find((item) => item.id === activeMatchId);
  const leader = stats.find((row) => row.points > 0) ?? null;
  const events = match ? eventsForMatch(data, match.id) : [];
  const ranked = stats.filter((row) => row.points > 0 || row.appearances > 0);
  const result = match ? matchResult(data, match.id) : null;
  const active = boards.find((item) => item.key === board) ?? boards[0];

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'season', label: '시즌 전체' },
            { value: 'match', label: '이 경기' },
          ]}
        />
        {scope === 'match' ? <MatchPicker /> : null}

        {leader ? (
          <Card>
            <Hero
              label={scope === 'season' ? '시즌 득점 선두' : '이 경기 최다 공격포인트'}
              value={`${leader.member.name} ${leader.goals}골`}
              caption={
                leader.assists
                  ? `도움 ${leader.assists}개도 있어요 · ${leader.appearances}경기 출전`
                  : `${leader.appearances}경기 출전`
              }
            />
          </Card>
        ) : null}

        {scope === 'season' && record && record.win + record.draw + record.lose > 0 ? (
          <Card>
            {/* 경기 메모의 "3-2 승" 같은 스코어를 읽어서 자동으로 센다. */}
            <Row justify="space-between">
              <Stat label="승" value={`${record.win}`} tone={p.ok} />
              <Stat label="무" value={`${record.draw}`} />
              <Stat label="패" value={`${record.lose}`} tone={p.danger} />
            </Row>
            <Txt variant="tiny" muted>
              경기 메모에 적힌 스코어(예: 3-2 승)로 세요. 스코어가 없는 경기는 빠져요.
            </Txt>
          </Card>
        ) : null}

        {scope === 'season' && active ? (
          <>
            <SectionHeader title="랭킹" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {boards.map((item) => (
                <Chip
                  key={item.key}
                  label={item.title}
                  selected={item.key === active.key}
                  onPress={() => setBoard(item.key)}
                />
              ))}
            </ScrollView>
            <Card style={{ padding: space.sm, gap: 0 }}>
              {active.rows.length === 0 ? (
                <Empty text={'아직 이 부문 기록이 없어요.'} />
              ) : (
                active.rows.map((row, index) => (
                  <View key={row.member.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row justify="space-between" style={{ padding: space.sm }}>
                      <Row style={{ flexShrink: 1 }}>
                        <Txt
                          variant="h3"
                          tabular
                          color={index < 3 ? p.primaryStrong : p.textFaint}
                          style={{ width: 22 }}
                        >
                          {index + 1}
                        </Txt>
                        <Txt variant="body">{row.member.name}</Txt>
                      </Row>
                      <Txt variant="h3" tabular>
                        {row.display}
                      </Txt>
                    </Row>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}

        <SectionHeader title="선수별 기록" />
        <Card style={{ padding: space.sm, gap: 0 }}>
          <Row justify="space-between" style={{ paddingHorizontal: space.sm, paddingBottom: space.sm }}>
            <Txt variant="tiny" muted>
              선수
            </Txt>
            <Row gap={space.lg}>
              <Txt variant="tiny" muted>
                출전
              </Txt>
              <Txt variant="tiny" muted>
                골
              </Txt>
              <Txt variant="tiny" muted>
                도움
              </Txt>
            </Row>
          </Row>
          {ranked.length === 0 ? (
            <Empty text={'아직 기록이 없어요.\n경기 끝나고 한 줄 적어 보세요.'} />
          ) : (
            ranked.map((row, index) => (
              <View key={row.member.id}>
                <Divider />
                <Row justify="space-between" style={{ padding: space.sm }}>
                  <Row style={{ flexShrink: 1 }}>
                    <Txt variant="h3" tabular color={index < 3 ? p.primaryStrong : p.textFaint} style={{ width: 22 }}>
                      {index + 1}
                    </Txt>
                    <View style={{ flexShrink: 1 }}>
                      <Txt variant="body">{row.member.name}</Txt>
                      {row.cards > 0 ? (
                        <Txt variant="tiny" color={p.warn}>
                          경고/퇴장 {row.cards}
                        </Txt>
                      ) : null}
                    </View>
                  </Row>
                  <Row gap={space.lg}>
                    <Txt variant="small" muted tabular style={{ width: 24, textAlign: 'right' }}>
                      {row.appearances}
                    </Txt>
                    <Txt variant="h3" tabular style={{ width: 24, textAlign: 'right' }}>
                      {row.goals}
                    </Txt>
                    <Txt variant="h3" muted tabular style={{ width: 24, textAlign: 'right' }}>
                      {row.assists}
                    </Txt>
                  </Row>
                </Row>
              </View>
            ))
          )}
        </Card>

        {scope === 'match' && match ? (
          <>
            {result ? (
              <Card>
                <Txt variant="h3">
                  {result.us} : {result.them}{' '}
                  <Txt
                    variant="h3"
                    color={
                      result.outcome === 'win' ? p.ok : result.outcome === 'lose' ? p.danger : p.textMuted
                    }
                  >
                    {result.outcome === 'win' ? '승' : result.outcome === 'lose' ? '패' : '무'}
                  </Txt>
                </Txt>
                <Txt variant="tiny" muted>
                  경기 메모에 적힌 스코어로 자동 판정했어요.
                </Txt>
              </Card>
            ) : null}

            <PotmCard data={data} matchId={match.id} />

            <SectionHeader title={`${formatDate(match.date)} 기록`} />
            <Card style={{ padding: space.sm, gap: 0 }}>
              {events.length === 0 ? (
                <Empty text={'이 경기 기록이 없어요.\n"전반 12분 상혁이 골" 처럼 적어서 넣어 보세요.'} />
              ) : (
                events.map((event, index) => (
                  <View key={event.id}>
                    {index > 0 ? <Divider /> : null}
                    <Row justify="space-between" style={{ padding: space.sm }}>
                      <Row>
                        <Txt variant="small" muted style={{ width: 44 }}>
                          {event.minute != null ? `${event.minute}'` : '-'}
                        </Txt>
                        <Txt variant="body">{memberName(data.members, event.memberId)}</Txt>
                        <Txt variant="small" color={p.primary}>
                          {EVENT_LABEL[event.type]}
                        </Txt>
                      </Row>
                      <Button label="삭제" tone="danger" small onPress={() => removeEvent(event.id)} />
                    </Row>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}
      </Screen>
      <QuickInputFab hint="event" />
    </View>
  );
}
