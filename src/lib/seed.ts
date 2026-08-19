import { DEFAULT_FORMATION } from '@/features/lineup/formations';
import { shiftPeriod, thisPeriod, todayISO } from '@/lib/format';
import type { AppData, Attendance, Ledger, Match, MatchEvent, Member, PositionGroup } from '@/lib/types';

/**
 * 데모 모드에서 앱을 처음 열었을 때 채워 넣는 예시 팀.
 * 화면들이 제대로 보이려면 이력이 어느 정도 쌓여 있어야 해서, 지난 시즌 8경기를 만들어 둔다.
 * 값은 전부 결정적으로 만든다 — 앱을 다시 열 때마다 출석률이 달라지면 데모가 아니라 소음이다.
 */
const TEAM_ID = 'demo-team';

/** [이름, 포지션, 등번호, 장점, 대략적인 출석 성향(0~1)] */
const ROSTER: [string, PositionGroup, number, string[], number][] = [
  ['김병준', 'GK', 1, ['선방', '리더십', '빌드업'], 1.0],
  ['이도현', 'DF', 2, ['수비 리딩', '헤딩'], 0.95],
  ['박성우', 'DF', 3, ['체력', '오른발'], 0.8],
  ['최민석', 'DF', 4, ['헤딩', '몸싸움'], 0.7],
  ['정우진', 'DF', 5, ['왼발', '위치선정'], 0.9],
  ['한재영', 'MF', 6, ['패스', '체력', '멘탈'], 1.0],
  ['오세훈', 'MF', 7, ['드리블', '스피드'], 0.85],
  ['임현수', 'MF', 8, ['빌드업', '중거리'], 0.75],
  ['서지호', 'MF', 10, ['킥력', '패스', '왼발'], 0.9],
  ['강태윤', 'FW', 9, ['위치선정', '마무리'], 1.0],
  ['윤상혁', 'FW', 11, ['스피드', '드리블'], 0.95],
  ['배준영', 'FW', 13, ['헤딩'], 0.45],
  ['노경민', 'DF', 14, ['체력'], 0.6],
  ['조현우', 'GK', 21, ['선방'], 0.5],
  ['신동찬', 'MF', 17, ['패스'], 0.7],
  ['문지환', 'FW', 19, ['스피드', '오른발'], 0.35],
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
    joinedOn: index >= 14 ? daysFromToday(-35) : daysFromToday(-400),
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

  // 이번 달은 11명, 지난달은 전원이 냈다. 미납 화면이 비어 보이지 않게.
  members.slice(0, 11).forEach((member, index) => {
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
    team: { id: TEAM_ID, name: '방화 FC', monthlyDue: 30000, inviteCode: 'DEMO24' },
    members,
    matches: [upcoming, ...past],
    attendance,
    ledger,
    events,
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
