/** 화면에서 반복적으로 필요한 집계. 순수 함수로 두어 어디서든 재사용한다. */
import { daysUntil, shiftPeriod, thisPeriod } from '@/lib/format';
import type {
  AppData,
  Appearance,
  Attendance,
  AttendanceStatus,
  Ledger,
  Match,
  MatchEvent,
  Member,
  PositionGroup,
} from '@/lib/types';

export function memberMap(members: Member[]): Map<string, Member> {
  return new Map(members.map((member) => [member.id, member]));
}

/**
 * 대표로 보여 줄 포지션 하나.
 *
 * 이제 한 사람이 여러 자리를 보지만, 명단 한 줄이나 칩 하나에는 하나만 들어간다.
 * 배열 앞쪽을 주 포지션으로 본다.
 */
export function mainPosition(member: Member): PositionGroup | null {
  return member.positions[0] ?? null;
}

/** 이 사람이 그 자리를 볼 수 있는지. 라인업 배치에서 쓴다. */
export function playsPosition(member: Member, group: PositionGroup): boolean {
  return member.positions.includes(group);
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

/**
 * 아직 참석 여부를 안 밝힌 사람.
 *
 * 총무가 알고 싶은 건 "몇 명 왔나"가 아니라 "누구를 찔러야 하나"다.
 * 숫자만 보여 주면 결국 명단을 눈으로 훑어야 한다.
 */
export function unrespondedMembers(data: AppData, matchId: string): Member[] {
  const rows = attendanceForMatch(data, matchId);
  return data.members.filter(
    (member) => member.active && (rows.get(member.id)?.status ?? 'unknown') === 'unknown',
  );
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


// ------------------------------------------------------------------ 출전 시간

/** 경기 하나에서 각자 몇 쿼터를 뛰었는지. */
export function quartersForMatch(data: AppData, matchId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of data.appearances) {
    if (row.matchId !== matchId) continue;
    counts.set(row.memberId, (counts.get(row.memberId) ?? 0) + 1);
  }
  return counts;
}

export type PlayingTime = {
  member: Member;
  /** 최근 경기들에서 뛴 쿼터 합. */
  quarters: number;
  /** 그 사이 참석한 경기 수. 분모. */
  attended: number;
  /** 경기당 평균 쿼터. attended 가 0이면 null. */
  perMatch: number | null;
};

/**
 * 최근 경기 기준 출전량. 라인업 배정의 공정성 근거가 된다.
 *
 * 시즌 전체로 재면 최근에 계속 빠진 사람이 영원히 앞자리를 차지한다.
 * 기본 6경기로 끊어서 "요즘 덜 뛴 사람"을 본다.
 */
export function playingTime(data: AppData, recentMatches = 6, excludeMatchId?: string): PlayingTime[] {
  const scope = new Set(
    [...data.matches]
      .filter((match) => match.status !== 'canceled' && match.id !== excludeMatchId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, recentMatches)
      .map((match) => match.id),
  );

  const quarters = new Map<string, number>();
  for (const row of data.appearances) {
    if (!scope.has(row.matchId)) continue;
    quarters.set(row.memberId, (quarters.get(row.memberId) ?? 0) + 1);
  }

  const attended = new Map<string, number>();
  for (const row of data.attendance) {
    if (!scope.has(row.matchId)) continue;
    if (row.status === 'attending' || row.status === 'late') {
      attended.set(row.memberId, (attended.get(row.memberId) ?? 0) + 1);
    }
  }

  return data.members
    .filter((member) => member.active)
    .map((member) => {
      const played = quarters.get(member.id) ?? 0;
      const came = attended.get(member.id) ?? 0;
      return { member, quarters: played, attended: came, perMatch: came ? played / came : null };
    });
}

/**
 * 덜 뛴 사람이 앞에 오는 순서.
 *
 * 왔는데 못 뛴 사람(perMatch 가 0)이 가장 앞이고, 아직 기록이 없는 사람은
 * 그 다음이다. 같은 값이면 이름순으로 고정해 매번 같은 결과가 나오게 한다.
 */
export function fairnessOrder(data: AppData, pool: Member[], excludeMatchId?: string): Member[] {
  const time = new Map(playingTime(data, 6, excludeMatchId).map((row) => [row.member.id, row]));
  return [...pool].sort((a, b) => {
    const left = time.get(a.id);
    const right = time.get(b.id);
    // 기록이 아예 없으면 판단 근거가 없으니 중간(1쿼터)으로 놓는다.
    const lv = left?.perMatch ?? 1;
    const rv = right?.perMatch ?? 1;
    if (lv !== rv) return lv - rv;
    return a.name.localeCompare(b.name, 'ko');
  });
}

// ------------------------------------------------------------------ MVP

export type PotmResult = { member: Member; votes: number };

/** 경기 MVP 집계. 표가 하나도 없으면 빈 배열. */
export function potmTally(data: AppData, matchId: string): PotmResult[] {
  const counts = new Map<string, number>();
  for (const row of data.potmVotes) {
    if (row.matchId !== matchId) continue;
    counts.set(row.memberId, (counts.get(row.memberId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([memberId, votes]) => ({
      member: data.members.find((m) => m.id === memberId),
      votes,
    }))
    .filter((row): row is PotmResult => Boolean(row.member))
    .sort((a, b) => b.votes - a.votes || a.member.name.localeCompare(b.member.name, 'ko'));
}

/** 시즌 동안 MVP 로 뽑힌 횟수(경기별 1위 기준). */
export function potmWins(data: AppData): Map<string, number> {
  const wins = new Map<string, number>();
  for (const match of data.matches) {
    const tally = potmTally(data, match.id);
    if (!tally.length) continue;
    // 동률이면 아무도 1위로 세지 않는다. 억지로 한 명을 고르면 그게 분란이 된다.
    if (tally.length > 1 && tally[1].votes === tally[0].votes) continue;
    wins.set(tally[0].member.id, (wins.get(tally[0].member.id) ?? 0) + 1);
  }
  return wins;
}

// ------------------------------------------------------------------ 랭킹

export type RankingKey = 'points' | 'goals' | 'assists' | 'attendance' | 'quarters' | 'potm';

export type RankingRow = {
  member: Member;
  /** 순위를 매기는 값. */
  value: number;
  /** 화면에 쓸 표시값. "8골", "92%" 처럼 단위까지 들어간다. */
  display: string;
};

export type Ranking = {
  key: RankingKey;
  title: string;
  /** 값이 0인 사람만 남으면 순위표를 띄우지 않는다. */
  rows: RankingRow[];
};

/**
 * 랭킹 여섯 가지.
 *
 * 하나만 두면 골 못 넣는 사람은 평생 이름이 안 나온다. 골 말고도
 * 도움·개근·출전량·MVP 로 이름이 불릴 자리를 만든다.
 */
export function rankings(data: AppData): Ranking[] {
  const stats = playerStats(data);
  const time = playingTime(data, 99);
  const profiles = allProfiles(data);
  const wins = potmWins(data);

  const trim = (rows: RankingRow[]) => rows.filter((row) => row.value > 0).slice(0, 10);

  return [
    {
      key: 'points',
      title: '공격 포인트',
      rows: trim(
        stats.map((row) => ({
          member: row.member,
          value: row.points,
          display: `${row.points}P`,
        })),
      ),
    },
    {
      key: 'goals',
      title: '득점',
      rows: trim(
        [...stats]
          .sort((a, b) => b.goals - a.goals)
          .map((row) => ({ member: row.member, value: row.goals, display: `${row.goals}골` })),
      ),
    },
    {
      key: 'assists',
      title: '도움',
      rows: trim(
        [...stats]
          .sort((a, b) => b.assists - a.assists)
          .map((row) => ({ member: row.member, value: row.assists, display: `${row.assists}개` })),
      ),
    },
    {
      key: 'attendance',
      title: '개근',
      rows: trim(
        profiles
          .filter((profile) => profile.eligible > 0)
          .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))
          .map((profile) => ({
            member: profile.member,
            value: Math.round((profile.rate ?? 0) * 100),
            display: `${Math.round((profile.rate ?? 0) * 100)}%`,
          })),
      ),
    },
    {
      key: 'quarters',
      title: '출전 쿼터',
      rows: trim(
        [...time]
          .sort((a, b) => b.quarters - a.quarters)
          .map((row) => ({
            member: row.member,
            value: row.quarters,
            display: `${row.quarters}쿼터`,
          })),
      ),
    },
    {
      key: 'potm',
      title: 'MVP',
      rows: trim(
        data.members
          .filter((member) => member.active)
          .map((member) => ({
            member,
            value: wins.get(member.id) ?? 0,
            display: `${wins.get(member.id) ?? 0}회`,
          }))
          .sort((a, b) => b.value - a.value),
      ),
    },
  ];
}

// ------------------------------------------------------------------ 승패

export type MatchResult = { us: number; them: number; outcome: 'win' | 'draw' | 'lose' };

/**
 * 우리 득점만 기록에서 세고, 상대 득점은 경기 메모에 적힌 스코어에서 읽는다.
 * 조기축구에서 상대 팀 득점자까지 적는 팀은 없다.
 */
export function matchResult(data: AppData, matchId: string): MatchResult | null {
  const match = data.matches.find((row) => row.id === matchId);
  if (!match || match.status !== 'finished') return null;

  const us =
    data.events.filter((row) => row.matchId === matchId && row.type === 'goal').length -
    data.events.filter((row) => row.matchId === matchId && row.type === 'own_goal').length;

  // "3-2", "3:2", "3 대 2" 를 모두 읽는다. 앞이 우리 점수라고 본다.
  const scored = match.note?.match(/(\d{1,2})\s*(?:[-:]|대)\s*(\d{1,2})/);
  const them = scored ? Number(scored[2]) : null;
  if (them === null) return null;

  const ours = scored ? Number(scored[1]) : us;
  return {
    us: ours,
    them,
    outcome: ours > them ? 'win' : ours === them ? 'draw' : 'lose',
  };
}

export type TeamRecord = { win: number; draw: number; lose: number };

export function teamRecord(data: AppData): TeamRecord {
  const record: TeamRecord = { win: 0, draw: 0, lose: 0 };
  for (const match of data.matches) {
    const result = matchResult(data, match.id);
    if (result) record[result.outcome] += 1;
  }
  return record;
}

/** 이 경기에서 뛴 쿼터를 한 명분 세는 작은 도우미. 화면에서 자주 쓴다. */
export function quartersOf(appearances: Appearance[], matchId: string, memberId: string): number {
  return appearances.filter((row) => row.matchId === matchId && row.memberId === memberId).length;
}
