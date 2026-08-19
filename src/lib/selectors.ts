/** 화면에서 반복적으로 필요한 집계. 순수 함수로 두어 어디서든 재사용한다. */
import { daysUntil, shiftPeriod, thisPeriod } from '@/lib/format';
import type {
  AppData,
  Attendance,
  AttendanceStatus,
  Ledger,
  Match,
  MatchEvent,
  Member,
} from '@/lib/types';

export function memberMap(members: Member[]): Map<string, Member> {
  return new Map(members.map((member) => [member.id, member]));
}

export function memberName(members: Member[], id: string | null): string {
  if (!id) return '팀 공동';
  return members.find((member) => member.id === id)?.name ?? '(삭제된 회원)';
}

/** 오늘 이후 가장 가까운 경기. 없으면 가장 최근 경기. */
export function focusMatch(matches: Match[]): Match | null {
  if (!matches.length) return null;
  const upcoming = matches
    .filter((match) => match.status === 'scheduled' && daysUntil(match.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length) return upcoming[0];
  return [...matches].sort((a, b) => b.date.localeCompare(a.date))[0];
}

export function attendanceForMatch(data: AppData, matchId: string): Map<string, Attendance> {
  return new Map(
    data.attendance.filter((row) => row.matchId === matchId).map((row) => [row.memberId, row]),
  );
}

export type AttendanceTally = Record<AttendanceStatus, number>;

export function tallyAttendance(data: AppData, matchId: string): AttendanceTally {
  const rows = attendanceForMatch(data, matchId);
  const tally: AttendanceTally = { attending: 0, absent: 0, late: 0, unknown: 0 };
  for (const member of data.members) {
    if (!member.active) continue;
    tally[rows.get(member.id)?.status ?? 'unknown'] += 1;
  }
  return tally;
}

/** 참석 + 지각. 라인업을 짤 수 있는 인원. */
export function availableMembers(data: AppData, matchId: string): Member[] {
  const rows = attendanceForMatch(data, matchId);
  return data.members.filter((member) => {
    if (!member.active) return false;
    const status = rows.get(member.id)?.status;
    return status === 'attending' || status === 'late';
  });
}

// ------------------------------------------------------------------ 회비

export type DueStatus = {
  member: Member;
  paid: number;
  /** 회비 기준액에서 납부액을 뺀 금액. 0 이하면 완납. */
  outstanding: number;
};

export function duesForPeriod(data: AppData, period: string): DueStatus[] {
  return data.members
    .filter((member) => member.active)
    .map((member) => {
      const paid = data.ledger
        .filter((row) => row.kind === 'due' && row.memberId === member.id && row.period === period)
        .reduce((sum, row) => sum + row.amount, 0);
      return { member, paid, outstanding: Math.max(0, data.team.monthlyDue - paid) };
    });
}

export type Balance = { income: number; expense: number; net: number };

/** period가 없으면 전체 기간. */
export function balance(ledger: Ledger[], period?: string): Balance {
  const rows = period ? ledger.filter((row) => (row.period ?? row.occurredOn.slice(0, 7)) === period) : ledger;
  const income = rows.filter((row) => row.kind !== 'expense').reduce((sum, row) => sum + row.amount, 0);
  const expense = rows.filter((row) => row.kind === 'expense').reduce((sum, row) => sum + row.amount, 0);
  return { income, expense, net: income - expense };
}

/** 지금까지 쌓인 팀 잔고. */
export function treasury(ledger: Ledger[]): number {
  return balance(ledger).net;
}

export function recentPeriods(count = 6): string[] {
  const now = thisPeriod();
  return Array.from({ length: count }, (_, i) => shiftPeriod(now, -i));
}

// ------------------------------------------------------------------ 기록

export type PlayerStat = {
  member: Member;
  goals: number;
  assists: number;
  saves: number;
  cards: number;
  appearances: number;
  points: number;
};

/** 시즌 랭킹. points = 골 + 어시로 단순 정렬한다. */
export function playerStats(data: AppData, matchIds?: Set<string>): PlayerStat[] {
  const inScope = (row: MatchEvent) => !matchIds || matchIds.has(row.matchId);
  const attended = new Map<string, number>();
  for (const row of data.attendance) {
    if (matchIds && !matchIds.has(row.matchId)) continue;
    if (row.status === 'attending' || row.status === 'late') {
      attended.set(row.memberId, (attended.get(row.memberId) ?? 0) + 1);
    }
  }

  return data.members
    .filter((member) => member.active)
    .map((member) => {
      const own = data.events.filter((row) => row.memberId === member.id && inScope(row));
      const count = (type: MatchEvent['type']) => own.filter((row) => row.type === type).length;
      const goals = count('goal');
      const assists = count('assist');
      return {
        member,
        goals,
        assists,
        saves: count('save'),
        cards: count('yellow') + count('red'),
        appearances: attended.get(member.id) ?? 0,
        points: goals + assists,
      };
    })
    .sort((a, b) => b.points - a.points || b.goals - a.goals || b.appearances - a.appearances);
}

/** 특정 경기의 이벤트를 시간순으로. */
export function eventsForMatch(data: AppData, matchId: string): MatchEvent[] {
  return data.events
    .filter((row) => row.matchId === matchId)
    .sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
}

// ------------------------------------------------------------------ 회원 카드

export type MemberProfile = {
  member: Member;
  /** 가입 이후 치른 경기 수. 출석률의 분모. */
  eligible: number;
  attended: number;
  late: number;
  absent: number;
  /** 0~1. eligible 이 0이면 null (아직 칠 경기가 없었다는 뜻). */
  rate: number | null;
  /** 최근 경기부터 앞으로 5개. 라인업 짤 때 폼을 보는 용도. */
  recent: { matchId: string; date: string; status: AttendanceStatus }[];
  goals: number;
  assists: number;
  saves: number;
  cards: number;
  /** 이번 달 기준 미납 금액. 0이면 완납. */
  outstanding: number;
  /** 회비를 낸 적 있는 달들. 최근 순. */
  paidPeriods: string[];
  totalPaid: number;
};

/**
 * 회원 한 명의 모든 것을 한 번에 계산한다.
 * 회원 목록에서 16명분을 돌리므로 전체 순회는 한 번씩만 한다.
 */
export function memberProfile(data: AppData, memberId: string, period = thisPeriod()): MemberProfile | null {
  const member = data.members.find((row) => row.id === memberId);
  if (!member) return null;

  // 가입 전 경기는 출석률에서 뺀다. 새로 들어온 회원이 부당하게 낮게 잡히지 않게.
  const played = data.matches
    .filter((match) => match.status !== 'canceled')
    .filter((match) => !member.joinedOn || match.date >= member.joinedOn)
    .filter((match) => daysUntil(match.date) <= 0 || match.status === 'finished')
    .sort((a, b) => b.date.localeCompare(a.date));

  const byMatch = new Map(
    data.attendance.filter((row) => row.memberId === memberId).map((row) => [row.matchId, row]),
  );

  let attended = 0;
  let late = 0;
  let absent = 0;
  for (const match of played) {
    const status = byMatch.get(match.id)?.status ?? 'unknown';
    if (status === 'attending') attended += 1;
    else if (status === 'late') late += 1;
    else if (status === 'absent') absent += 1;
  }

  const events = data.events.filter((row) => row.memberId === memberId);
  const count = (type: MatchEvent['type']) => events.filter((row) => row.type === type).length;

  const dues = data.ledger.filter((row) => row.kind === 'due' && row.memberId === memberId);
  const paidThisPeriod = dues
    .filter((row) => row.period === period)
    .reduce((sum, row) => sum + row.amount, 0);

  return {
    member,
    eligible: played.length,
    attended,
    late,
    absent,
    // 지각도 나온 것으로 친다. 안 나온 사람과 같이 묶으면 지각 표시를 할 이유가 없다.
    rate: played.length ? (attended + late) / played.length : null,
    recent: played.slice(0, 5).map((match) => ({
      matchId: match.id,
      date: match.date,
      status: byMatch.get(match.id)?.status ?? 'unknown',
    })),
    goals: count('goal'),
    assists: count('assist'),
    saves: count('save'),
    cards: count('yellow') + count('red'),
    outstanding: Math.max(0, data.team.monthlyDue - paidThisPeriod),
    paidPeriods: [...new Set(dues.map((row) => row.period).filter(Boolean) as string[])].sort().reverse(),
    totalPaid: dues.reduce((sum, row) => sum + row.amount, 0),
  };
}

/** 팀 전체 프로필. 회원 목록 화면용. */
export function allProfiles(data: AppData, period = thisPeriod()): MemberProfile[] {
  return data.members
    .filter((member) => member.active)
    .map((member) => memberProfile(data, member.id, period))
    .filter((profile): profile is MemberProfile => profile !== null);
}

/** 팀에서 이미 쓰이고 있는 장점 태그. 입력할 때 추천으로 띄운다. */
export function knownStrengths(members: Member[]): string[] {
  const counts = new Map<string, number>();
  for (const member of members) {
    for (const tag of member.strengths) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
}

/** 처음 쓰는 팀을 위한 기본 추천 태그. */
export const STRENGTH_SUGGESTIONS = [
  '왼발', '오른발', '헤딩', '스피드', '체력', '빌드업', '수비 리딩',
  '킥력', '중거리', '드리블', '패스', '위치선정', '리더십', '멘탈',
];
