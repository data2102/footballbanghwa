/** 조기축구 팀 운영 도메인 모델. Supabase 테이블 및 AI 파서 출력과 1:1로 대응한다. */

export type MemberRole = 'manager' | 'coach' | 'treasurer' | 'player';

/** 포지션 그룹. 포메이션 슬롯과 선수 선호 포지션에 함께 쓰인다. */
export type PositionGroup = 'GK' | 'DF' | 'MF' | 'FW';

export type Member = {
  id: string;
  teamId: string;
  name: string;
  /** 팀 내 별명. "철수형", "막내" 같이 문자로 들어오는 호칭을 매칭할 때 쓴다. */
  nickname: string | null;
  role: MemberRole;
  backNumber: number | null;
  preferredPosition: PositionGroup | null;
  /** 탈퇴/휴면 회원은 false. 명단·회비 집계에서 제외된다. */
  active: boolean;
};

export type Team = {
  id: string;
  name: string;
  /** 월 회비 기본액(원). 미납자 계산의 기준. */
  monthlyDue: number;
  inviteCode: string | null;
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
};
