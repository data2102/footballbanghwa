import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useStore } from '@/lib/store';
import { allProfiles } from '@/lib/selectors';
import {
  Card,
  Divider,
  Empty,
  Hero,
  Progress,
  Row,
  Screen,
  SectionHeader,
  Segmented,
  Stat,
  Txt,
  space,
} from '@/components/ui';
import { usePalette } from '@/theme';

/**
 * 출결 분석.
 *
 * 총무가 알고 싶은 건 두 가지다 — 누가 잘 나오나, 그리고 누가 답을 안 하나.
 * 둘은 다른 문제다. 안 나오는 사람은 사정이 있는 거고, 답을 안 하는 사람은
 * 매주 라인업 짜는 사람을 기다리게 만든다.
 */
type Sort = 'rate' | 'silent';

export default function AnalysisScreen() {
  const p = usePalette();
  const data = useStore((state) => state.data);
  const [sort, setSort] = useState<Sort>('rate');

  const rows = useMemo(() => {
    if (!data) return [];
    return allProfiles(data)
      .map((profile) => {
        // 답을 안 한 횟수 = 집계한 경기 - (참석 + 불참 + 투표만 확인된 것).
        const silent = Math.max(
          0,
          profile.eligible - profile.attended - profile.late - profile.absent - profile.voted,
        );
        return {
          ...profile,
          silent,
          silentRate: profile.eligible ? silent / profile.eligible : 0,
        };
      })
      .sort((a, b) =>
        sort === 'silent'
          ? b.silent - a.silent || a.member.name.localeCompare(b.member.name, 'ko')
          : (b.rate ?? -1) - (a.rate ?? -1),
      );
  }, [data, sort]);

  if (!data) return null;

  const played = rows.filter((row) => row.eligible > 0);
  const teamRate = played.length
    ? Math.round((played.reduce((sum, row) => sum + (row.rate ?? 0), 0) / played.length) * 100)
    : null;
  const totalSilent = rows.reduce((sum, row) => sum + row.silent, 0);
  const everSilent = rows.filter((row) => row.silent > 0).length;
  // 참석·불참이 실제로 적힌 경기 수. 구간 카드를 띄울지 정한다.
  const decidedMatches = new Set(
    data.attendance
      .filter((row) => row.status === 'attending' || row.status === 'late' || row.status === 'absent')
      .map((row) => row.matchId),
  ).size;

  return (
    <Screen>
      <Card>
        <Hero
          label="팀 평균 참석률"
          value={teamRate === null ? '-' : `${teamRate}%`}
          suffix={teamRate === null ? undefined : `· ${played.length}명`}
          caption={
            totalSilent
              ? `답을 안 한 게 모두 ${totalSilent}번이에요. ${everSilent}명이 한 번이라도 그랬어요.`
              : '모두 매번 답을 줬어요.'
          }
        />
        <Txt variant="tiny" muted>
          집계를 안 한 주는 세지 않아요. 아무도 답을 안 남긴 경기는 총무가 그 주를 건너뛴
          것이지 전원이 답을 안 한 게 아니에요.
        </Txt>
      </Card>

      {/*
        참석률 구간은 참석·불참을 밝힌 경기가 어느 정도 쌓여야 뜻이 있다.
        두어 경기로 나누면 모두가 0%·50%·100% 셋 중 하나가 되어 읽을 게 없다.
      */}
      {decidedMatches >= 4 ? (
        <Card>
          <Row justify="space-between">
            <Stat label="80% 이상" value={`${played.filter((r) => (r.rate ?? 0) >= 0.8).length}명`} tone={p.ok} />
            <Stat label="50~80%" value={`${played.filter((r) => (r.rate ?? 0) >= 0.5 && (r.rate ?? 0) < 0.8).length}명`} />
            <Stat label="50% 미만" value={`${played.filter((r) => (r.rate ?? 0) < 0.5).length}명`} tone={p.danger} />
          </Row>
          <Txt variant="tiny" muted>
              가입한 뒤에 치른 경기만 세요. 늦게 들어온 사람이 낮게 잡히지 않아요.
            참석률은 참석·불참을 밝힌 경기만으로 내요 — 투표만 확인된 기록은 빼요.
          </Txt>
        </Card>
      ) : null}

      <SectionHeader title="회원별" />
      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          { value: 'rate', label: '참석률 순' },
          { value: 'silent', label: '답 안 한 순' },
        ]}
      />

      <Card style={{ padding: space.sm, gap: 0 }}>
        {rows.length === 0 ? (
          <Empty text={'아직 셀 경기가 없어요.\n경기를 만들고 참석을 모아 보세요.'} />
        ) : (
          rows.map((row, index) => {
            const rate = row.rate;
            const tone = rate === null ? p.textFaint : rate < 0.5 ? p.danger : rate < 0.75 ? p.warn : p.ok;
            return (
              <View key={row.member.id}>
                {index > 0 ? <Divider /> : null}
                <View style={{ padding: space.sm, gap: 6 }}>
                  <Row justify="space-between">
                    <Txt variant="body" style={{ flexShrink: 1 }}>
                      {row.member.name}
                    </Txt>
                    <Row gap={space.md}>
                      {row.silent > 0 ? (
                        <Txt variant="tiny" color={p.warn} tabular>
                          무응답 {row.silent}
                        </Txt>
                      ) : null}
                      <Txt variant="h3" tabular color={tone} style={{ minWidth: 48, textAlign: 'right' }}>
                        {rate === null ? '-' : `${Math.round(rate * 100)}%`}
                      </Txt>
                    </Row>
                  </Row>
                  <Progress value={rate ?? 0} />
                  <Txt variant="tiny" muted>
                    {row.eligible}경기 중 무응답 {row.silent}
                    {row.attended + row.late ? ` · 참석 ${row.attended + row.late}` : ''}
                    {row.absent ? ` · 불참 ${row.absent}` : ''}
                    {row.voted ? ` · 투표만 확인 ${row.voted}` : ''}
                  </Txt>
                </View>
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}
