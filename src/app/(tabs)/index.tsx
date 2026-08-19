import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { isLocalRepo } from '@/lib/repo';
import { formatDate, relativeDay, thisPeriod, won, wonShort } from '@/lib/format';
import {
  duesForPeriod,
  focusMatch,
  playerStats,
  tallyAttendance,
  treasury,
} from '@/lib/selectors';
import { Button, Card, Divider, Empty, Row, Screen, SectionHeader, Stat, Txt, space } from '@/components/ui';
import { QuickInputFab } from '@/components/QuickInputFab';
import { usePalette } from '@/theme';

export default function HomeScreen() {
  const p = usePalette();
  const router = useRouter();
  const data = useStore((state) => state.data);
  if (!data) return null;

  const match = focusMatch(data.matches);
  const tally = match ? tallyAttendance(data, match.id) : null;
  const period = thisPeriod();
  const unpaid = duesForPeriod(data, period).filter((row) => row.outstanding > 0);
  const balance = treasury(data.ledger);
  const top = playerStats(data).slice(0, 3);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Row justify="space-between">
          <View>
            <Txt variant="h1">{data.team.name}</Txt>
            <Txt variant="small" muted>
              회원 {data.members.filter((m) => m.active).length}명 · 월 회비 {won(data.team.monthlyDue)}
            </Txt>
          </View>
          <Button label="설정" tone="neutral" small onPress={() => router.push('/settings')} />
        </Row>

        {isLocalRepo ? (
          <Card style={{ backgroundColor: p.warnSoft, borderColor: p.warnSoft }}>
            <Txt variant="h3" color={p.warn}>
              데모 모드로 실행 중
            </Txt>
            <Txt variant="small" color={p.warn}>
              Supabase 환경변수가 없어 기기 저장소에만 저장되고, 문자 분석도 간단한 규칙 파서가 대신
              처리합니다. README의 연결 안내를 따르면 Claude 파싱과 팀 공유가 켜집니다.
            </Txt>
          </Card>
        ) : null}

        {match ? (
          <Card onPress={() => router.push('/attendance')}>
            <Row justify="space-between">
              <Txt variant="tiny" muted>
                {match.status === 'finished' ? '지난 경기' : '다음 경기'}
              </Txt>
              <Txt variant="tiny" color={p.primary}>
                {relativeDay(match.date)}
              </Txt>
            </Row>
            <Txt variant="h2">
              {formatDate(match.date)} {match.kickoff}
            </Txt>
            <Txt variant="small" muted>
              {match.venue}
              {match.opponent ? ` · vs ${match.opponent}` : ''}
            </Txt>
            <Divider />
            <Row gap={space.sm} wrap>
              <Stat label="참석" value={`${tally?.attending ?? 0}`} tone={p.ok} />
              <Stat label="지각" value={`${tally?.late ?? 0}`} tone={p.warn} />
              <Stat label="불참" value={`${tally?.absent ?? 0}`} tone={p.danger} />
              <Stat label="미응답" value={`${tally?.unknown ?? 0}`} />
            </Row>
          </Card>
        ) : (
          <Card>
            <Empty text={'예정된 경기가 없습니다.\n설정에서 경기를 추가해 주세요.'} />
          </Card>
        )}

        <SectionHeader
          title="회비"
          action={<Button label="장부 열기" tone="neutral" small onPress={() => router.push('/finance')} />}
        />
        <Card>
          <Row gap={space.sm} wrap>
            <Stat label="팀 잔고" value={`${wonShort(balance)}원`} tone={balance >= 0 ? p.text : p.danger} />
            <Stat
              label={`${Number(period.slice(5))}월 미납`}
              value={`${unpaid.length}명`}
              tone={unpaid.length ? p.danger : p.ok}
            />
          </Row>
          {unpaid.length ? (
            <Txt variant="small" muted numberOfLines={2}>
              {unpaid.map((row) => row.member.name).join(', ')}
            </Txt>
          ) : (
            <Txt variant="small" color={p.ok}>
              이번 달 회비는 전원 완납입니다.
            </Txt>
          )}
        </Card>

        <SectionHeader
          title="시즌 랭킹"
          action={<Button label="전체 보기" tone="neutral" small onPress={() => router.push('/stats')} />}
        />
        <Card>
          {top.every((row) => row.points === 0) ? (
            <Empty text="아직 기록이 없습니다. 경기 후 문자로 입력해 보세요." />
          ) : (
            top.map((row, index) => (
              <Row key={row.member.id} justify="space-between">
                <Row>
                  <Txt variant="h3" color={index === 0 ? p.primary : p.textMuted}>
                    {index + 1}
                  </Txt>
                  <Txt variant="body">{row.member.name}</Txt>
                </Row>
                <Txt variant="small" muted>
                  {row.goals}골 {row.assists}도움
                </Txt>
              </Row>
            ))
          )}
        </Card>
      </Screen>
      <QuickInputFab />
    </View>
  );
}
