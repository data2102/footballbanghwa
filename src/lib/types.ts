/** 조기축구 팀 운영 도메인 모델. Supabase 테이블 및 AI 파서 출력과 1:1로 대응한다. */

export type MemberRole = 'manager' | 'coach' | 'treasurer' | 'player';

/** 포지션 그룹. 포메이션 슬롯과 선수 선호 포지션에 함께 쓰인다. */
export type PositionGroup = 'GK' | 'DF' | 'MF' | 'FW';

/**
 * 연령대. 조기축구는 나이대가 팀 운영에 실제로 영향을 준다 —
 * 쿼터 배분이나 포지션을 정할 때 참고한다. 생년월일까지 받을 이유는 없다.
 */
export type AgeBand = '30' | '40' | '50' | '60';

export type Member = {
  id: string;
  teamId: string;
  name: string;
  /** 팀 내 별명. "철수형", "막내" 같이 문자로 들어오는 호칭을 매칭할 때 쓴다. */
  nickname: string | null;
  role: MemberRole;
  backNumber: number | null;
  /**
   * 볼 수 있는 자리들. 조기축구에서 한 사람이 한 자리만 보는 경우는 드물다 —
   * 수비도 보고 미드도 보는 사람이 대부분이라 여러 개를 담는다. 앞쪽이 주 포지션이다.
   */
  positions: PositionGroup[];
  /** 30대·40대·50대·60대. 모르면 null. */
  ageBand: AgeBand | null;
  /**
   * 감독·코치가 기억해 둘 장점 태그. 예: ['왼발', '헤딩', '체력', '빌드업'].
   * 라인업을 짤 때 이 사람을 왜 쓰는지가 한 줄로 보여야 해서 자유 문자열로 둔다.
   */
  strengths: string[];
  /** 감독 메모. 부상 이력, 성향 등 태그로 담기 어려운 것. */
  note: string | null;
  /**
   * 화면에 그릴 사진 주소. Supabase 모드에서는 서명된 임시 URL 이라 저장하지 않고 매번 새로 만든다.
   * 데모 모드에서는 data URI 를 그대로 넣고 저장한다.
   */
  photoUri: string | null;
  /** 스토리지 안의 경로(<team_id>/<member_id>.jpg). 실제로 DB에 저장되는 값. */
  photoPath: string | null;
  /** 팀에 들어온 날. YYYY-MM-DD. 출석률 계산의 시작점이 된다. */
  joinedOn: string | null;
  /** 탈퇴/휴면 회원은 false. 명단·회비 집계에서 제외된다. */
  active: boolean;
};

export type Team = {
  id: string;
  name: string;
  /** 월 회비 기본액(원). 미납자 계산의 기준. */
  monthlyDue: number;
  inviteCode: string | null;
  /** 경기 전날 미응답자에게 알림을 보낼지. 팀 단위 스위치. */
  reminderEnabled: boolean;
  /**
   * 회칙. 단톡방 공지에 매번 붙여넣는 대신 여기 두고 꺼내 쓴다.
   * 자유 문장이라 구조를 잡지 않는다 — 팀마다 형태가 너무 다르다.
   */
  rules: string | null;
};

export type MatchStatus = 'scheduled' | 'finished' | 'canceled';

export type Match = {
  id: string;
  teamId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  kickoff: string;
  venue: string;
  opponent: string | null;
  status: MatchStatus;
  note: string | null;
  /**
   * 가입 없이 참석만 받는 링크의 열쇠. null 이면 아직 링크를 만들지 않은 경기다.
   * 팀원 16명을 전부 회원가입시키는 게 도입의 가장 큰 장벽이라 이 우회로를 둔다.
   * 토큰만 알면 그 경기의 참석을 바꿀 수 있으므로, 경기 하나 범위로만 쓴다.
   */
  shareToken: string | null;
};

export type AttendanceStatus = 'attending' | 'absent' | 'late' | 'unknown';

export type Attendance = {
  id: string;
  matchId: string;
  memberId: string;
  status: AttendanceStatus;
  /** 지각 예상 시각(HH:mm) 또는 불참 사유 등 부가 정보. */
  note: string | null;
  source: EntrySource;
  updatedAt: string;
};

export type LedgerKind = 'due' | 'income' | 'expense';

export type Ledger = {
  id: string;
  teamId: string;
  /** 회비/개인 정산이면 납부자, 팀 공동 지출이면 null. */
  memberId: string | null;
  kind: LedgerKind;
  /** 원 단위 정수. 지출도 양수로 저장하고 kind로 부호를 정한다. */
  amount: number;
  /** 회비가 어느 달 몫인지. YYYY-MM. 회비가 아니면 null. */
  period: string | null;
  /** YYYY-MM-DD */
  occurredOn: string;
  memo: string | null;
  source: EntrySource;
};

export type MatchEventType = 'goal' | 'assist' | 'save' | 'yellow' | 'red' | 'own_goal';

export type MatchEvent = {
  id: string;
  matchId: string;
  memberId: string;
  type: MatchEventType;
  /** 경기 시작 후 분. 모르면 null. */
  minute: number | null;
};

export type LineupSlot = {
  /** 포메이션 안에서의 고유 키. 예: 'DF2' */
  key: string;
  group: PositionGroup;
  /** 필드 위 상대 좌표 0~1. x는 좌우, y는 우리 골문(0)에서 상대 골문(1) 방향. */
  x: number;
  y: number;
  memberId: string | null;
};

export type Lineup = {
  id: string;
  matchId: string;
  formationId: string;
  slots: LineupSlot[];
  /** 선발에 못 든 참석자. 교체 명단. */
  benchMemberIds: string[];
};

/**
 * 쿼터 단위 출전 기록.
 *
 * 조기축구 라인업의 진짜 갈등은 포메이션이 아니라 "누가 더 뛰었나" 다.
 * 출석률(왔는지)과 출전량(뛰었는지)은 다른 값이라 따로 센다.
 */
export type Appearance = {
  id: string;
  matchId: string;
  memberId: string;
  /** 1부터. 조기축구는 보통 3~4쿼터를 돈다. */
  quarter: number;
  source: EntrySource;
};

/**
 * 경기 MVP 한 표.
 *
 * 누가 누구를 찍었는지는 저장하지 않는다 — 동호회에서 그게 드러나면 분란이 된다.
 * ballot 은 기기마다 무작위로 만든 값이라 사람을 되짚을 수 없고, 한 기기가 표를
 * 두 번 넣거나 바꾸는 것만 가려낸다.
 */
export type PotmVote = {
  id: string;
  matchId: string;
  /** 표를 받은 사람. */
  memberId: string;
  ballot: string;
};

/** 데이터가 사람이 직접 입력한 것인지, AI 파싱 결과를 승인한 것인지 구분. */
export type EntrySource = 'manual' | 'ai';

export type AppData = {
  team: Team;
  members: Member[];
  matches: Match[];
  attendance: Attendance[];
  ledger: Ledger[];
  events: MatchEvent[];
  lineups: Lineup[];
  appearances: Appearance[];
  potmVotes: PotmVote[];
};
