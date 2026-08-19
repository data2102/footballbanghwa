import { DEFAULT_FORMATION } from '@/features/lineup/formations';
import { shiftPeriod, thisPeriod, todayISO } from '@/lib/format';
import type {
  AppData,
  Appearance,
  Attendance,
  Ledger,
  Match,
  MatchEvent,
  Member,
  PositionGroup,
  PotmVote,
} from '@/lib/types';

/**
 * 데모 모드에서 앱을 처음 열었을 때 채워 넣는 예시 팀.
 *
 * 명단은 실제 팀 단톡방에서 가져왔지만 이름 가운데 글자를 가렸다(강*순).
 * 저장소가 공개라 남의 실명을 그대로 두지 않는다. 가린 탓에 김*수처럼 겹치는
 * 이름이 생기는데, 실제로도 동명이인은 있으니 그대로 둔다 — 등번호로 구분한다.
 * 화면들이 제대로 보이려면 이력이 어느 정도 쌓여 있어야 해서, 지난 시즌 8경기를 만들어 둔다.
 * 값은 전부 결정적으로 만든다 — 앱을 다시 열 때마다 출석률이 달라지면 데모가 아니라 소음이다.
 */
const TEAM_ID = 'demo-team';

/** [이름, 포지션, 등번호, 장점, 대략적인 출석 성향(0~1)] */
const ROSTER: [string, PositionGroup, number, string[], number][] = [
  ['강*순', 'DF', 2, ['수비 리딩', '헤딩'], 1.0],
  ['김*훈', 'MF', 3, ['드리블', '스피드'], 0.95],
  ['김*욱', 'FW', 4, ['헤딩'], 0.9],
  ['임*석', 'DF', 5, ['헤딩'], 0.85],
  ['강*수', 'MF', 6, ['패스'], 0.8],
  ['강*구', 'DF', 7, ['수비 리딩'], 0.75],
  ['고*훈', 'MF', 8, ['중거리'], 0.7],
  ['공*민', 'FW', 9, ['스피드', '드리블'], 0.65],
  ['곽*곤', 'DF', 10, ['수비 리딩', '헤딩'], 0.6],
  ['곽*문', 'MF', 11, ['드리블', '스피드'], 0.5],
  ['권*성', 'FW', 12, ['오른발', '스피드'], 0.45],
  ['권*현', 'DF', 13, ['헤딩'], 0.35],
  ['기*현', 'MF', 14, ['패스'], 1.0],
  ['김*욱', 'DF', 15, ['수비 리딩'], 0.95],
  ['김*환', 'MF', 16, ['중거리'], 0.9],
  ['김*규', 'FW', 17, ['마무리'], 0.85],
  ['김*식', 'DF', 18, ['수비 리딩', '헤딩'], 0.8],
  ['김*열', 'GK', 1, ['선방', '빌드업'], 0.75],
  ['김*혁', 'FW', 19, ['위치선정', '마무리'], 0.7],
  ['김*호', 'DF', 20, ['헤딩'], 0.65],
  ['김*호', 'MF', 22, ['패스'], 0.6],
  ['김*훈', 'DF', 23, ['수비 리딩'], 0.5],
  ['김*창', 'MF', 24, ['중거리'], 0.45],
  ['김*훈', 'FW', 25, ['왼발', '마무리'], 0.35],
  ['김*관', 'DF', 26, ['수비 리딩', '헤딩'], 1.0],
  ['김*문', 'MF', 27, ['드리블', '스피드'], 0.95],
  ['김*수', 'GK', 21, ['선방'], 0.9],
  ['김*수', 'DF', 28, ['헤딩'], 0.85],
  ['김*욱', 'MF', 29, ['패스'], 0.8],
  ['김*준', 'DF', 30, ['수비 리딩'], 0.75],
  ['김*균', 'MF', 32, ['중거리'], 0.7],
  ['김*주', 'FW', 33, ['스피드', '드리블'], 0.65],
  ['김*영', 'DF', 34, ['수비 리딩', '헤딩'], 0.6],
  ['김*만', 'GK', 31, ['선방', '빌드업'], 0.5],
  ['김*성', 'FW', 35, ['오른발', '스피드'], 0.45],
  ['김*수', 'DF', 36, ['헤딩'], 0.35],
  ['김*식', 'MF', 37, ['패스'], 1.0],
  ['김*중', 'DF', 38, ['수비 리딩'], 0.95],
  ['노*택', 'MF', 39, ['중거리'], 0.9],
  ['문*민', 'FW', 40, ['마무리'], 0.85],
  ['박*근', 'DF', 42, ['수비 리딩', '헤딩'], 0.8],
  ['박*진', 'MF', 43, ['드리블', '스피드'], 0.75],
  ['박*호', 'FW', 44, ['위치선정', '마무리'], 0.7],
  ['서*기', 'DF', 45, ['헤딩'], 0.65],
  ['서*훈', 'MF', 46, ['패스'], 0.6],
  ['서*태', 'DF', 47, ['수비 리딩'], 0.5],
  ['서*석', 'GK', 41, ['선방'], 0.45],
  ['성*혁', 'FW', 48, ['왼발', '마무리'], 0.35],
  ['소*장', 'DF', 49, ['수비 리딩', '헤딩'], 1.0],
  ['송*주', 'MF', 50, ['드리블', '스피드'], 0.95],
];

const VENUES = ['방화근린공원 축구장', '마곡 체육공원', '개화산 생활체육관'];
const OPPONENTS = ['강서 유나이티드', '마곡 FC', '등촌 조기회', '화곡 클럽', '까치산 FC'];

function daysFromToday(offset: number): string {
  const base = new Date(`${todayISO()}T00:00:00`);
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

/** 다음 일요일. 조기축구는 보통 주말 아침이다. */
function nextSunday(): string {
  const base = new Date(`${todayISO()}T00:00:00`);
  return daysFromToday((7 - base.getDay()) % 7 || 7);
}

/**
 * 같은 (회원, 경기) 조합이면 언제나 같은 값을 주는 0~1 난수.
 * Math.random 을 쓰면 앱을 열 때마다 시드가 흔들려서 못 쓴다.
 */
function noise(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function buildSeed(): AppData {
  const members: Member[] = ROSTER.map(([name, position, backNumber, strengths], index) => ({
    id: `m${index + 1}`,
    teamId: TEAM_ID,
    name,
    nickname: null,
    role: index === 0 ? 'manager' : index === 1 ? 'coach' : index === 2 ? 'treasurer' : 'player',
    backNumber,
    preferredPosition: position,
    strengths,
    note: index === 3 ? '작년에 발목 다친 적 있어요. 연속 출전은 피하는 게 좋아요.' : null,
    photoUri: null,
    photoPath: null,
    // 뒤쪽 두 명은 최근에 들어왔다. 출석률 분모가 다르게 잡히는지 확인하는 시드다.
    joinedOn: index >= 44 ? daysFromToday(-35) : daysFromToday(-400),
    active: true,
  }));

  // ------------------------------------------------------------ 경기
  const past: Match[] = Array.from({ length: 8 }, (_, i) => {
    const round = 8 - i; // 1이 가장 최근
    return {
      id: `match-${i + 1}`,
      teamId: TEAM_ID,
      date: daysFromToday(-7 * round),
      kickoff: '07:00',
      venue: VENUES[i % VENUES.length],
      opponent: OPPONENTS[i % OPPONENTS.length],
      status: 'finished' as const,
      note: i % 3 === 0 ? '3-2 승' : i % 3 === 1 ? '1-1 무' : '0-2 패',
      shareToken: null,
    };
  });

  const upcoming: Match = {
    id: 'match-next',
    teamId: TEAM_ID,
    date: nextSunday(),
    kickoff: '07:00',
    venue: VENUES[0],
    opponent: OPPONENTS[0],
    status: 'scheduled',
    note: null,
    shareToken: null,
  };

  // ------------------------------------------------------------ 참석
  const attendance: Attendance[] = [];
  for (const [matchIndex, match] of past.entries()) {
    for (const [memberIndex, member] of members.entries()) {
      if (member.joinedOn && match.date < member.joinedOn) continue;
      const roll = noise(memberIndex + 1, matchIndex + 1);
      const rate = ROSTER[memberIndex][4];
      const status = roll < rate - 0.08 ? 'attending' : roll < rate ? 'late' : 'absent';
      attendance.push({
        id: `att-${match.id}-${member.id}`,
        matchId: match.id,
        memberId: member.id,
        status,
        note: status === 'late' ? '조금 늦게 왔어요' : null,
        source: 'manual',
        updatedAt: match.date,
      });
    }
  }

  // ------------------------------------------------------------ 출전 쿼터
  // 공정성 화면이 읽히려면 "왔는데 덜 뛴 사람"이 실제로 있어야 한다.
  // 뒤쪽 번호(후보)일수록 쿼터가 적게 잡히도록 결정적으로 만든다.
  const appearances: Appearance[] = [];
  for (const [matchIndex, match] of past.entries()) {
    for (const [memberIndex, member] of members.entries()) {
      const came = attendance.find(
        (row) => row.matchId === match.id && row.memberId === member.id,
      );
      if (!came || came.status === 'absent') continue;
      // 주전(앞 11명)은 3~4쿼터, 후보는 0~2쿼터.
      const base = memberIndex < 11 ? 3 : 0;
      const extra = Math.floor(noise(memberIndex + 7, matchIndex + 3) * 2);
      const played = Math.min(4, base + extra);
      for (let q = 1; q <= played; q += 1) {
        appearances.push({
          id: `app-${match.id}-${member.id}-${q}`,
          matchId: match.id,
          memberId: member.id,
          quarter: q,
          source: 'manual',
        });
      }
    }
  }

  // ------------------------------------------------------------ MVP
  // 가장 최근 세 경기에만 표가 있다. "아직 투표 전"인 경기도 보여야 화면이 다 확인된다.
  // past 는 오래된 순이라 뒤에서 세 개를 고른다.
  const potmVotes: PotmVote[] = [];
  for (const [matchIndex, match] of past.slice(-3).entries()) {
    // 한 경기에 6표. 표를 몰아주지 않고 두세 명에게 갈리게 둔다.
    for (let v = 0; v < 6; v += 1) {
      const pick = Math.floor(noise(matchIndex + 11, v + 5) * 11);
      potmVotes.push({
        id: `potm-${match.id}-${v}`,
        matchId: match.id,
        memberId: members[pick].id,
        ballot: `seed-ballot-${matchIndex}-${v}`,
      });
    }
  }

  // ------------------------------------------------------------ 경기 기록
  // 골잡이가 분명해야 랭킹 화면이 읽힌다.
  const scorers: [string, number][] = [['m10', 7], ['m11', 5], ['m9', 2], ['m7', 1]];
  const assisters: [string, number][] = [['m9', 6], ['m11', 4], ['m6', 3], ['m10', 2]];
  const events: MatchEvent[] = [];
  let seq = 0;

  for (const [memberId, count] of scorers) {
    for (let n = 0; n < count; n += 1) {
      const match = past[n % past.length];
      events.push({
        id: `ev-g-${seq++}`,
        matchId: match.id,
        memberId,
        minute: 8 + Math.floor(noise(seq, n) * 70),
      type: 'goal',
      });
    }
  }
  for (const [memberId, count] of assisters) {
    for (let n = 0; n < count; n += 1) {
      const match = past[n % past.length];
      events.push({
        id: `ev-a-${seq++}`,
        matchId: match.id,
        memberId,
        minute: 8 + Math.floor(noise(seq, n) * 70),
        type: 'assist',
      });
    }
  }
  for (let n = 0; n < 9; n += 1) {
    events.push({
      id: `ev-s-${seq++}`,
      matchId: past[n % past.length].id,
      memberId: 'm1',
      minute: 20 + Math.floor(noise(seq, n) * 50),
      type: 'save',
    });
  }
  events.push({ id: 'ev-y-1', matchId: past[2].id, memberId: 'm4', minute: 63, type: 'yellow' });

  // ------------------------------------------------------------ 회비·장부
  const period = thisPeriod();
  const previous = shiftPeriod(period, -1);
  const ledger: Ledger[] = [];

  // 이번 달은 3분의 2쯤 냈고 지난달은 전원이 냈다. 미납 화면이 비어 보이지 않게 하되,
  // 명단 크기가 바뀌어도 비율이 유지되도록 인원수에서 계산한다.
  members.slice(0, Math.round(members.length * 0.68)).forEach((member, index) => {
    ledger.push({
      id: `due-${period}-${member.id}`,
      teamId: TEAM_ID,
      memberId: member.id,
      kind: 'due',
      amount: 30000,
      period,
      occurredOn: daysFromToday(-18 + index),
      memo: null,
      source: index % 4 === 0 ? 'ai' : 'manual',
    });
  });
  members.forEach((member, index) => {
    ledger.push({
      id: `due-${previous}-${member.id}`,
      teamId: TEAM_ID,
      memberId: member.id,
      kind: 'due',
      amount: 30000,
      period: previous,
      occurredOn: daysFromToday(-45 + index),
      memo: null,
      source: 'manual',
    });
  });

  for (const [index, match] of past.slice(0, 4).entries()) {
    ledger.push({
      id: `exp-ground-${index}`,
      teamId: TEAM_ID,
      memberId: null,
      kind: 'expense',
      amount: 120000,
      period: null,
      occurredOn: match.date,
      memo: '구장 대관료',
      source: 'manual',
    });
  }
  ledger.push({
    id: 'exp-vest',
    teamId: TEAM_ID,
    memberId: null,
    kind: 'expense',
    amount: 84000,
    period: null,
    occurredOn: daysFromToday(-30),
    memo: '조끼 12벌',
    source: 'manual',
  });

  const lastMatch = past[past.length - 1];

  return {
    team: {
      id: TEAM_ID,
      name: '방화 FC',
      monthlyDue: 30000,
      inviteCode: 'DEMO24',
      reminderEnabled: true,
    },
    members,
    matches: [upcoming, ...past],
    attendance,
    ledger,
    events,
    appearances,
    potmVotes,
    lineups: [
      {
        id: 'lineup-last',
        matchId: lastMatch.id,
        formationId: DEFAULT_FORMATION.id,
        slots: DEFAULT_FORMATION.slots.map((slot, index) => ({
          ...slot,
          memberId: members[index]?.id ?? null,
        })),
        benchMemberIds: members.slice(11, 13).map((member) => member.id),
      },
    ],
  };
}
