import { DEFAULT_FORMATION } from '@/features/lineup/formations';
import { shiftPeriod, thisPeriod, todayISO } from '@/lib/format';
import type { AppData, Member, PositionGroup } from '@/lib/types';

/** 데모 모드에서 앱을 처음 열었을 때 채워 넣는 예시 팀. */
const NAMES: [string, PositionGroup, number][] = [
  ['김병준', 'GK', 1],
  ['이도현', 'DF', 2],
  ['박성우', 'DF', 3],
  ['최민석', 'DF', 4],
  ['정우진', 'DF', 5],
  ['한재영', 'MF', 6],
  ['오세훈', 'MF', 7],
  ['임현수', 'MF', 8],
  ['서지호', 'MF', 10],
  ['강태윤', 'FW', 9],
  ['윤상혁', 'FW', 11],
  ['배준영', 'FW', 13],
  ['노경민', 'DF', 14],
  ['조현우', 'GK', 21],
  ['신동찬', 'MF', 17],
  ['문지환', 'FW', 19],
];

const TEAM_ID = 'demo-team';

function daysFromToday(offset: number): string {
  const base = new Date(`${todayISO()}T00:00:00`);
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
}

/** 다음 일요일. 조기축구는 보통 주말 아침이라 기본 경기를 일요일로 잡는다. */
function nextSunday(): string {
  const base = new Date(`${todayISO()}T00:00:00`);
  const delta = (7 - base.getDay()) % 7 || 7;
  return daysFromToday(delta);
}

export function buildSeed(): AppData {
  const members: Member[] = NAMES.map(([name, position, backNumber], index) => ({
    id: `m${index + 1}`,
    teamId: TEAM_ID,
    name,
    nickname: null,
    role: index === 0 ? 'manager' : index === 1 ? 'coach' : index === 2 ? 'treasurer' : 'player',
    backNumber,
    preferredPosition: position,
    active: true,
  }));

  const upcoming = nextSunday();
  const lastMatch = daysFromToday(-7);
  const period = thisPeriod();

  return {
    team: {
      id: TEAM_ID,
      name: '방화 FC',
      monthlyDue: 30000,
      inviteCode: 'DEMO24',
    },
    members,
    matches: [
      {
        id: 'match-next',
        teamId: TEAM_ID,
        date: upcoming,
        kickoff: '07:00',
        venue: '방화근린공원 축구장',
        opponent: '강서 유나이티드',
        status: 'scheduled',
        note: null,
      },
      {
        id: 'match-last',
        teamId: TEAM_ID,
        date: lastMatch,
        kickoff: '07:00',
        venue: '마곡 체육공원',
        opponent: '마곡 FC',
        status: 'finished',
        note: '3-2 승',
      },
    ],
    attendance: [
      // 지난 경기는 기록이 다 차 있고, 다음 경기는 비어 있는 상태에서 시작한다.
      ...members.slice(0, 13).map((member, index) => ({
        id: `att-last-${member.id}`,
        matchId: 'match-last',
        memberId: member.id,
        status: (index < 11 ? 'attending' : 'late') as 'attending' | 'late',
        note: null,
        source: 'manual' as const,
        updatedAt: lastMatch,
      })),
    ],
    ledger: [
      ...members.slice(0, 11).map((member, index) => ({
        id: `due-${member.id}`,
        teamId: TEAM_ID,
        memberId: member.id,
        kind: 'due' as const,
        amount: 30000,
        period,
        occurredOn: daysFromToday(-20 + index),
        memo: null,
        source: 'manual' as const,
      })),
      {
        id: 'exp-1',
        teamId: TEAM_ID,
        memberId: null,
        kind: 'expense' as const,
        amount: 120000,
        period: null,
        occurredOn: lastMatch,
        memo: '구장 대관료',
        source: 'manual' as const,
      },
      {
        id: 'due-prev',
        teamId: TEAM_ID,
        memberId: members[0].id,
        kind: 'due' as const,
        amount: 30000,
        period: shiftPeriod(period, -1),
        occurredOn: daysFromToday(-45),
        memo: null,
        source: 'manual' as const,
      },
    ],
    events: [
      { id: 'ev1', matchId: 'match-last', memberId: 'm10', type: 'goal', minute: 12 },
      { id: 'ev2', matchId: 'match-last', memberId: 'm10', type: 'goal', minute: 38 },
      { id: 'ev3', matchId: 'match-last', memberId: 'm11', type: 'goal', minute: 61 },
      { id: 'ev4', matchId: 'match-last', memberId: 'm9', type: 'assist', minute: 12 },
      { id: 'ev5', matchId: 'match-last', memberId: 'm6', type: 'assist', minute: 61 },
      { id: 'ev6', matchId: 'match-last', memberId: 'm1', type: 'save', minute: 70 },
    ],
    lineups: [
      {
        id: 'lineup-last',
        matchId: 'match-last',
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
