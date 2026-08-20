import { formationsForSize } from '@/features/lineup/formations';
import { shiftPeriod, thisPeriod, todayISO } from '@/lib/format';
import { KICKOFF, sundaysOf } from '@/lib/schedule';
import { ROSTER_2026, TRACKED_DATES } from '@/lib/roster2026';
import type {
  AgeBand,
  AppData,
  Attendance,
  Ledger,
  Match,
  MatchEvent,
  Lineup,
  LineupSide,
  Member,
  PositionGroup,
  PotmVote,
} from '@/lib/types';

/**
 * 데모 모드에서 앱을 처음 열었을 때 채워 넣는 예시 팀.
 *
 * 명단과 미투표 기록은 총무가 쓰던 2026년 엑셀 그대로다(`roster2026.ts`).
 * 이름만 가운데 글자를 가렸다(이*훈) — 저장소가 공개라 남의 실명을 두지 않는다.
 * 가린 탓에 겹치는 이름이 생기는데 실제로도 동명이인이 있으니 그대로 둔다. 등번호로 가른다.
 *
 * **엑셀에 있는 건 미투표뿐이다.** 참석·불참은 세지 않았다. 그래서 집계한 24주에는
 * 투표한 사람을 voted 로만 두고 참석 여부를 지어내지 않는다.
 *
 * 다만 그러면 출전·라인업·MVP 화면이 통째로 비어서 확인이 안 된다. 그래서 엑셀이
 * 다루지 않는 주(8.9 이후)에만 데모용 참석·라인업을 만들고, 그 경기 메모에
 * "데모"라고 적어 둔다 — 나중에 실제 기록과 섞이지 않게.
 *
 * 값은 전부 결정적으로 만든다 — 앱을 다시 열 때마다 출석률이 달라지면 데모가 아니라 소음이다.
 */
const TEAM_ID = 'demo-team';

/** 월 2만원, 연납 20만원. 한 번에 내면 두 달치를 깎아 주는 셈이다. */
const MONTHLY_DUE = 20000;
const ANNUAL_DUE = 200000;

/**
 * 시드 판.
 *
 * 데모 데이터는 기기 저장소에 한 번 저장되면 그 뒤로는 다시 안 읽는다. 그래서 이 파일을
 * 고쳐도 이미 앱을 열어 본 사람에게는 옛 데이터가 그대로 보인다 — 명단을 바꿨는데
 * 안 바뀐다는 말이 여기서 나온다.
 *
 * 시드를 의미 있게 바꿀 때마다 이 숫자를 올린다. 저장된 판이 다르면 버리고 새로 만든다.
 * 데모 데이터는 어차피 예시라 버려도 되고, 진짜 데이터는 Supabase 에 있다.
 */
export const SEED_VERSION = 8;

/**
 * 포지션과 장점은 엑셀에 없다. 총무가 센 건 미투표뿐이다.
 * 화면을 확인하려면 자리가 있어야 해서 명단 순서대로 돌려 넣는다 — 실제 자리가 아니다.
 * 실제 DB 로 옮길 때는 회원 상세에서 사람이 직접 고른다.
 */
const POSITION_CYCLE: PositionGroup[] = ['DF', 'MF', 'FW', 'DF', 'MF', 'GK', 'DF', 'MF', 'FW', 'MF'];

const STRENGTH_CYCLE: string[][] = [
  ['수비 리딩', '헤딩'],
  ['패스'],
  ['마무리', '위치선정'],
  ['헤딩'],
  ['드리블', '스피드'],
  ['선방', '빌드업'],
  ['수비 리딩'],
  ['중거리'],
  ['왼발', '스피드'],
  ['체력'],
];

/** 주 포지션 옆에 자연스럽게 겸하는 자리. 골키퍼는 겸하지 않는다. */
const SECOND_POSITION: Partial<Record<PositionGroup, PositionGroup>> = {
  DF: 'MF',
  MF: 'DF',
  FW: 'MF',
};

const VENUES = ['방화근린공원 축구장', '마곡 체육공원', '개화산 생활체육관'];
/** 지난 경기 메모에 남기는 스코어. 승패 자동 판정이 이걸 읽는다. */
const SCORES = ['3-2 승', '1-1 무', '0-2 패', '2-1 승', '2-2 무'];
/** 데모가 다루는 시즌. */
const SEASON_YEAR = 2026;

function daysFromToday(offset: number): string {
  const base = new Date(`${todayISO()}T00:00:00`);
  base.setDate(base.getDate() + offset);
  return base.toISOString().slice(0, 10);
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
  const members: Member[] = ROSTER_2026.map((entry, index) => {
    const position = POSITION_CYCLE[index % POSITION_CYCLE.length];
    return {
      id: `m${index + 1}`,
      teamId: TEAM_ID,
      name: entry.name,
      nickname: null,
      role: index === 0 ? 'manager' : index === 1 ? 'coach' : index === 2 ? 'treasurer' : 'player',
      // 엑셀 전체명단의 번호를 그대로 등번호로 쓴다. 동명이인을 가르는 건 이것뿐이다.
      backNumber: index + 1,
      // 조기축구는 한 자리만 보는 사람이 드물다. 주 포지션 옆에 볼 수 있는 자리를 하나 더 둔다.
      positions: SECOND_POSITION[position] ? [position, SECOND_POSITION[position]] : [position],
      ageBand: entry.ageBand as AgeBand,
      strengths: STRENGTH_CYCLE[index % STRENGTH_CYCLE.length],
      note: null,
      photoUri: null,
      photoPath: null,
      // 엑셀이 1월 4일부터 이 사람들을 세고 있었으니 그 전부터 있던 것으로 둔다.
      joinedOn: `${SEASON_YEAR - 1}-12-01`,
      active: true,
    };
  });

  // ------------------------------------------------------------ 경기
  // 매주 일요일 아침 자체경기. 상대 팀이 없으니 opponent 는 비운다.
  // 한 해치를 미리 깔아 두어야 화면에서 날짜만 고르면 된다.
  const today = todayISO();
  const tracked = new Set(TRACKED_DATES);
  const allSundays = sundaysOf(SEASON_YEAR).map((date, index) => ({
    id: `match-${date}`,
    teamId: TEAM_ID,
    date,
    kickoff: KICKOFF,
    venue: VENUES[index % VENUES.length],
    opponent: null,
    status: date < today ? ('finished' as const) : ('scheduled' as const),
    // 엑셀이 센 주에는 스코어를 지어내지 않는다. 총무가 적은 건 미투표뿐이다.
    note:
      date < today && !tracked.has(date) ? `${SCORES[index % SCORES.length]} (데모)` : null,
    shareToken: null,
  }));

  /*
   * 엑셀이 실제로 센 주와, 그 밖의 주를 갈라 둔다.
   *
   * 총무는 미투표만, 그것도 24주만 셌다. 3월 전체와 4월 초는 아예 빈칸이다 —
   * 아흔 명이 다 같이 답을 안 한 게 아니라 그 주에 체크를 건너뛴 것이다.
   * 그 주에는 참석 기록을 하나도 만들지 않는다. `memberProfile` 이 응답 0건인 경기를
   * 분모에서 빼기 때문에, 안 만드는 것만으로 "집계 안 함"이 표현된다.
   */
  const trackedMatches = allSundays.filter((match) => tracked.has(match.date));

  /*
   * 데모용으로 참석·라인업을 채울 경기.
   *
   * 엑셀이 안 다루는 주(8.9 이후) 중 이미 지난 것만 고른다. 엑셀 기간을 건드리면
   * 총무가 센 숫자와 어긋나고, 그러면 이 화면을 못 믿게 된다.
   */
  const demoMatches = allSundays
    .filter((match) => match.status === 'finished' && !tracked.has(match.date))
    .slice(-2);

  const upcoming =
    allSundays.find((match) => match.status === 'scheduled') ?? allSundays[allSundays.length - 1];

  // ------------------------------------------------------------ 참석
  const attendance: Attendance[] = [];

  /*
   * 엑셀에서 옮긴 24주. 답을 안 한 사람은 줄을 만들지 않고(= 미투표),
   * 나머지는 voted 로 둔다 — "투표는 했는데 참석인지 불참인지 우리는 모른다".
   * 참석으로 바꿔 넣으면 다음 주 라인업이 그 거짓말 위에서 짜인다.
   */
  for (const match of trackedMatches) {
    for (const [memberIndex, member] of members.entries()) {
      if (ROSTER_2026[memberIndex].silent.includes(match.date)) continue;
      attendance.push({
        id: `att-${match.id}-${member.id}`,
        matchId: match.id,
        memberId: member.id,
        status: 'voted',
        note: null,
        source: 'manual',
        updatedAt: match.date,
      });
    }
  }

  /*
   * 데모 경기에만 참석·불참을 만든다. 이 두 주는 엑셀에 없는 날이다.
   * 여기서는 전원이 답한 것으로 둔다 — 무응답을 더 얹으면 화면의 총계가
   * 총무가 엑셀에 센 124번과 안 맞아서, 맞는지 확인할 수가 없어진다.
   */
  for (const [matchIndex, match] of demoMatches.entries()) {
    for (const [memberIndex, member] of members.entries()) {
      const status = noise(memberIndex + 1, matchIndex + 1) < 0.55 ? 'attending' : 'absent';
      attendance.push({
        id: `att-${match.id}-${member.id}`,
        matchId: match.id,
        memberId: member.id,
        status,
        note: null,
        source: 'manual',
        updatedAt: match.date,
      });
    }
  }

  // ------------------------------------------------------------ 라인업과 출전
  // 자체경기라 한 판에 두 팀이 선다. 쿼터마다 사람이 바뀌고, 그 기록이 곧 출전 횟수다.
  // 공정성 화면이 읽히려면 "왔는데 덜 뛴 사람"이 실제로 있어야 해서, 명단을 쿼터마다
  // 조금씩 밀어 가며 채운다 — 밀다 보면 끝에서 잘리는 사람이 생기고, 그게 덜 뛴 사람이다.
  const SIDES: LineupSide[] = ['A', 'B'];
  const SQUAD = 8;
  const boardFormation = formationsForSize(SQUAD)[0];
  const lineups: Lineup[] = [];

  for (const [matchIndex, match] of demoMatches.entries()) {
    const attendees = members.filter((member) => {
      const row = attendance.find((item) => item.matchId === match.id && item.memberId === member.id);
      return row?.status === 'attending' || row?.status === 'late';
    });
    if (attendees.length < SQUAD * 2) continue;

    for (let quarter = 1; quarter <= 4; quarter += 1) {
      for (const [sideIndex, side] of SIDES.entries()) {
        // 쿼터마다 3칸씩 민다. 두 팀은 서로 8칸 떨어뜨려 같은 사람이 겹치지 않게 한다.
        const offset = (quarter - 1) * 3 + sideIndex * SQUAD + matchIndex;
        const picked = Array.from(
          { length: SQUAD },
          (_, i) => attendees[(offset + i) % attendees.length],
        );
        lineups.push({
          id: `lineup-${match.id}-${quarter}-${side}`,
          matchId: match.id,
          quarter,
          side,
          formationId: boardFormation.id,
          slots: boardFormation.slots.map((slot, index) => ({
            ...slot,
            memberId: picked[index]?.id ?? null,
          })),
          photoUri: null,
          photoPath: null,
        });
      }
    }
  }

  // ------------------------------------------------------------ MVP
  // 가장 최근 세 경기에만 표가 있다. "아직 투표 전"인 경기도 보여야 화면이 다 확인된다.
  // past 는 오래된 순이라 뒤에서 세 개를 고른다.
  const potmVotes: PotmVote[] = [];
  for (const [matchIndex, match] of demoMatches.entries()) {
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
  // 골잡이가 분명해야 랭킹 화면이 읽힌다. 엑셀에 없는 데모 경기에만 붙인다.
  const scorers: [string, number][] = [['m10', 7], ['m11', 5], ['m9', 2], ['m7', 1]];
  const assisters: [string, number][] = [['m9', 6], ['m11', 4], ['m6', 3], ['m10', 2]];
  const events: MatchEvent[] = [];
  let seq = 0;

  for (const [memberId, count] of scorers) {
    for (let n = 0; n < count; n += 1) {
      const match = demoMatches[n % demoMatches.length];
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
      const match = demoMatches[n % demoMatches.length];
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
      matchId: demoMatches[n % demoMatches.length].id,
      memberId: 'm1',
      minute: 20 + Math.floor(noise(seq, n) * 50),
      type: 'save',
    });
  }
  events.push({ id: 'ev-y-1', matchId: demoMatches[0].id, memberId: 'm4', minute: 63, type: 'yellow' });

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
      amount: MONTHLY_DUE,
      period,
      months: 1,
      occurredOn: daysFromToday(-2 - (index % 20)),
      memo: null,
      photoUri: null,
      photoPath: null,
      source: index % 4 === 0 ? 'ai' : 'manual',
    });
  });
  members.forEach((member, index) => {
    ledger.push({
      id: `due-${previous}-${member.id}`,
      teamId: TEAM_ID,
      memberId: member.id,
      kind: 'due',
      amount: MONTHLY_DUE,
      period: previous,
      months: 1,
      occurredOn: daysFromToday(-32 - (index % 20)),
      memo: null,
      photoUri: null,
      photoPath: null,
      source: 'manual',
    });
  });

  for (const [index, match] of demoMatches.entries()) {
    ledger.push({
      id: `exp-ground-${index}`,
      teamId: TEAM_ID,
      memberId: null,
      kind: 'expense',
      amount: 120000,
      period: null,
      months: 1,
      occurredOn: match.date,
      memo: '구장 대관료',
      photoUri: null,
      photoPath: null,
      source: 'manual',
    });
  }
  // 연납한 사람이 하나는 있어야 "연납" 표시가 화면에서 확인된다.
  // 올해 1월부터 열두 달을 덮는다.
  ledger.push({
    id: 'due-annual-1',
    teamId: TEAM_ID,
    memberId: members[3].id,
    kind: 'due',
    amount: ANNUAL_DUE,
    period: `${SEASON_YEAR}-01`,
    months: 12,
    occurredOn: `${SEASON_YEAR}-01-11`,
    memo: '연납',
    photoUri: null,
    photoPath: null,
    source: 'manual',
  });

  ledger.push({
    id: 'sponsor-1',
    teamId: TEAM_ID,
    memberId: members[0].id,
    kind: 'income',
    amount: 300000,
    period: null,
    months: 1,
    occurredOn: daysFromToday(-52),
    memo: '찬조 (개업 기념)',
    photoUri: null,
    photoPath: null,
    source: 'manual',
  });

  ledger.push({
    id: 'exp-vest',
    teamId: TEAM_ID,
    memberId: null,
    kind: 'expense',
    amount: 84000,
    period: null,
    months: 1,
    occurredOn: daysFromToday(-30),
    memo: '조끼 12벌',
    photoUri: null,
    photoPath: null,
    source: 'manual',
  });


  return {
    team: {
      id: TEAM_ID,
      name: '방화 FC',
      monthlyDue: MONTHLY_DUE,
      annualDue: ANNUAL_DUE,
      inviteCode: 'DEMO24',
      reminderEnabled: true,
      rules: null,
    },
    members,
    matches: allSundays,
    attendance,
    ledger,
    events,
    potmVotes,
    lineups,
    // 매주 들고 나가는 것들. 알고 싶은 건 몇 개 남았나 하나뿐이다.
    inventory: [
      { id: 'inv-vest', teamId: TEAM_ID, name: '조끼(주황)', quantity: 12, note: null },
      { id: 'inv-vest-b', teamId: TEAM_ID, name: '조끼(파랑)', quantity: 11, note: '두 벌 찢어짐' },
      { id: 'inv-ball', teamId: TEAM_ID, name: '경기구', quantity: 4, note: null },
      { id: 'inv-cone', teamId: TEAM_ID, name: '라바콘', quantity: 20, note: null },
      { id: 'inv-kit', teamId: TEAM_ID, name: '구급함', quantity: 1, note: null },
    ],
  };
}
