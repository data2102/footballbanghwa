import { formationsForSize } from '@/features/lineup/formations';
import { shiftPeriod, thisPeriod, todayISO } from '@/lib/format';
import { KICKOFF, sundaysOf } from '@/lib/schedule';
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
 * 명단은 실제 팀 단톡방에서 가져왔지만 이름 가운데 글자를 가렸다(강*순).
 * 저장소가 공개라 남의 실명을 그대로 두지 않는다. 가린 탓에 김*수처럼 겹치는
 * 이름이 생기는데, 실제로도 동명이인은 있으니 그대로 둔다 — 등번호로 구분한다.
 * 화면들이 제대로 보이려면 이력이 어느 정도 쌓여 있어야 해서, 지난 시즌 8경기를 만들어 둔다.
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
export const SEED_VERSION = 7;

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

/** 주 포지션 옆에 자연스럽게 겸하는 자리. 골키퍼는 겸하지 않는다. */
const SECOND_POSITION: Partial<Record<PositionGroup, PositionGroup>> = {
  DF: 'MF',
  MF: 'DF',
  FW: 'MF',
};

/** 조기축구 연령대는 30~50대가 두껍고 60대가 얇다. 그 비율로 돌린다. */
const AGE_BANDS: AgeBand[] = ['40', '30', '50', '40', '30', '40', '50', '60', '40', '30'];

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
  const members: Member[] = ROSTER.map(([name, position, backNumber, strengths], index) => ({
    id: `m${index + 1}`,
    teamId: TEAM_ID,
    name,
    nickname: null,
    role: index === 0 ? 'manager' : index === 1 ? 'coach' : index === 2 ? 'treasurer' : 'player',
    backNumber,
    // 조기축구는 한 자리만 보는 사람이 드물다. 주 포지션 옆에 볼 수 있는 자리를 하나 더 둔다.
    positions: SECOND_POSITION[position] ? [position, SECOND_POSITION[position]] : [position],
    ageBand: AGE_BANDS[index % AGE_BANDS.length],
    strengths,
    note: index === 3 ? '작년에 발목 다친 적 있어요. 연속 출전은 피하는 게 좋아요.' : null,
    photoUri: null,
    photoPath: null,
    // 뒤쪽 두 명은 최근에 들어왔다. 출석률 분모가 다르게 잡히는지 확인하는 시드다.
    joinedOn: index >= 44 ? daysFromToday(-35) : daysFromToday(-400),
    active: true,
  }));

  // ------------------------------------------------------------ 경기
  // 매주 일요일 아침 자체경기. 상대 팀이 없으니 opponent 는 비운다.
  // 한 해치를 미리 깔아 두어야 화면에서 날짜만 고르면 된다.
  const today = todayISO();
  const allSundays = sundaysOf(SEASON_YEAR).map((date, index) => ({
    id: `match-${date}`,
    teamId: TEAM_ID,
    date,
    kickoff: KICKOFF,
    venue: VENUES[index % VENUES.length],
    opponent: null,
    status: date < today ? ('finished' as const) : ('scheduled' as const),
    note: date < today ? SCORES[index % SCORES.length] : null,
    shareToken: null,
  }));

  // 기록을 쌓을 대상은 가장 최근에 치른 여덟 경기다. 쉰 경기에 전부 기록을 만들면
  // 데모가 무거워지기만 하고 화면에서 보는 건 똑같다.
  const past = allSundays.filter((match) => match.status === 'finished').slice(-8);
  const upcoming =
    allSundays.find((match) => match.status === 'scheduled') ?? allSundays[allSundays.length - 1];

  // ------------------------------------------------------------ 참석
  const attendance: Attendance[] = [];
  for (const [matchIndex, match] of past.entries()) {
    for (const [memberIndex, member] of members.entries()) {
      if (member.joinedOn && match.date < member.joinedOn) continue;
      const roll = noise(memberIndex + 1, matchIndex + 1);
      const rate = ROSTER[memberIndex][4];
      // 아예 답을 안 한 경우. 출결 분석의 "무응답"이 0이면 그 화면을 확인할 수 없다.
      if (noise(memberIndex + 31, matchIndex + 17) > 0.88) continue;
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

  // ------------------------------------------------------------ 라인업과 출전
  // 자체경기라 한 판에 두 팀이 선다. 쿼터마다 사람이 바뀌고, 그 기록이 곧 출전 횟수다.
  // 공정성 화면이 읽히려면 "왔는데 덜 뛴 사람"이 실제로 있어야 해서, 명단을 쿼터마다
  // 조금씩 밀어 가며 채운다 — 밀다 보면 끝에서 잘리는 사람이 생기고, 그게 덜 뛴 사람이다.
  const SIDES: LineupSide[] = ['A', 'B'];
  const SQUAD = 8;
  const boardFormation = formationsForSize(SQUAD)[0];
  const lineups: Lineup[] = [];

  for (const [matchIndex, match] of past.entries()) {
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

  for (const [index, match] of past.slice(-4).entries()) {
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
