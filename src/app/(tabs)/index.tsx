import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStore } from '@/lib/store';
import { isLocalRepo } from '@/lib/repo';
import { daysUntil, formatDate, thisPeriod, won, wonShort } from '@/lib/format';
import {
  duesForPeriod,
  focusMatch,
  playerStats,
  tallyAttendance,
  treasury,
} from '@/lib/selectors';
import {
  Button,
  Card,
  Divider,
  Empty,
  Hero,
  Progress,
  Row,
  Screen,
  SectionHeader,
  Txt,
  space,
} from '@/components/ui';
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
              Supabase 환경변수가 없어 이 기기에만 저장되고, 문자 분석도 간단한 규칙 파서가 대신
              처리해요. README의 연결 안내를 따르면 Claude 파싱과 팀 공유가 켜져요.
            </Txt>
          </Card>
        ) : null}

        {match ? (
          <Card onPress={() => router.push('/attendance')}>
            <Hero
              label={countdownLabel(match.date, match.status === 'finished')}
              value={countdownValue(match.date)}
              caption={`${formatDate(match.date)} ${match.kickoff} · ${match.venue}${
                match.opponent ? `\nvs ${match.opponent}` : ''
              }`}
            />
            <Divider />
            {/* 참석 탭과 같은 세 칸이다. 지각은 카톡 투표에 없어서 뺐다. */}
            <Row gap={space.xl} wrap>
              <Tally label="참석" value={(tally?.attending ?? 0) + (tally?.late ?? 0)} tone={p.ok} />
              <Tally label="불참" value={tally?.absent ?? 0} tone={p.danger} />
              <Tally label="미투표" value={tally?.unknown ?? 0} />
            </Row>
          </Card>
        ) : (
          <Card>
            <Empty text={'다음 경기를 아직 안 만들었어요.\n설정에서 경기를 추가해 보세요.'} />
          </Card>
        )}

        <SectionHeader
          title="회비"
          action={<Button label="장부 열기" tone="neutral" small onPress={() => router.push('/finance')} />}
        />
        <Card>
          <Row justify="space-between">
            <Txt variant="tiny" muted>
              이번 달 회비
            </Txt>
            <Txt variant="tiny" muted tabular>
              {data.members.filter((m) => m.active).length - unpaid.length} /{' '}
              {data.members.filter((m) => m.active).length}명
            </Txt>
          </Row>
          <Progress
            value={
              (data.members.filter((m) => m.active).length - unpaid.length) /
              Math.max(1, data.members.filter((m) => m.active).length)
            }
          />
          {unpaid.length ? (
            <Txt variant="tiny" muted numberOfLines={2}>
              {unpaid
                .slice(0, 3)
                .map((row) => row.member.name)
                .join(', ')}
              {unpaid.length > 3 ? ` 외 ${unpaid.length - 3}명` : ''}이 아직이에요
            </Txt>
          ) : (
            <Txt variant="tiny" color={p.ok}>
              이번 달 회비는 다 걷혔어요
            </Txt>
          )}
          <Txt variant="tiny" muted tabular>
            팀 잔고 {wonShort(balance)}원
          </Txt>
        </Card>

        <SectionHeader
          title="시즌 득점"
          action={<Button label="전체 보기" tone="neutral" small onPress={() => router.push('/stats')} />}
        />
        <Card>
          {top.every((row) => row.points === 0) ? (
            <Empty text={'아직 기록이 없어요.\n경기 끝나고 문자나 사진으로 넣어 보세요.'} />
          ) : (
            top.map((row, index) => (
              <Row key={row.member.id} justify="space-between">
                <Row>
                  <Txt
                    variant="h3"
                    tabular
                    color={index < 3 ? p.primaryStrong : p.textFaint}
                    style={{ width: 18 }}
                  >
                    {index + 1}
                  </Txt>
                  <Txt variant="body">{row.member.name}</Txt>
                </Row>
                <Txt variant="small" muted tabular>
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

function countdownLabel(date: string, finished: boolean): string {
  if (finished) return '지난 경기';
  const diff = daysUntil(date);
  if (diff < 0) return '지난 경기';
  return '다음 경기까지';
}

function countdownValue(date: string): string {
  const diff = daysUntil(date);
  if (diff === 0) return '오늘';
  if (diff < 0) return `${-diff}일 전`;
  return `${diff}일`;
}

/** 참석 집계 세 칸. 화면의 주인공은 위의 큰 숫자라서 여기는 조용히 둔다. */
function Tally({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="tiny" muted>
        {label}
      </Txt>
      <Txt variant="h3" color={tone}>
        {value}
      </Txt>
    </View>
  );
}
