/** 조기축구 팀 운영 도메인 모델. Supabase 테이블 및 AI 파서 출력과 1:1로 대응한다. */

export type MemberRole = 'manager' | 'coach' | 'treasurer' | 'player';

/** 포지션 그룹. 포메이션 슬롯과 선수 선호 포지션에 함께 쓰인다. */
export type PositionGroup = 'GK' | 'DF' | 'MF' | 'FW';

/**
 * 연령대. 조기축구는 나이대가 팀 운영에 실제로 영향을 준다 —
 * 쿼터 배분이나 포지션을 정할 때 참고한다. 생년월일까지 받을 이유는 없다.
 */
/** 조기축구는 나이대가 쿼터 배분과 포지션에 실제로 영향을 준다. */
export type AgeBand = '20' | '30' | '40' | '50' | '60';

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
  /**
   * 연납 금액(원). 월 회비 × 12 보다 싸게 두는 게 보통이다.
   * 한 번에 내면 총무가 열두 번 확인할 일이 없어지니, 그 값만큼 깎아 주는 셈이다.
   */
  annualDue: number;
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

/**
 * 참석 상태.
 *
 * 'late'(지각)는 더 이상 화면에서 고를 수 없다. 참석 투표를 카톡에서 하고
 * 그 결과를 옮겨 적는 방식이라, 왔는지 안 왔는지만 있으면 된다.
 * 값 자체는 남긴다 — 예전에 지각으로 적어 둔 기록이 사라지면 안 된다.
 */
/**
 * 참석 상태.
 *
 * voted 는 "투표는 했는데 참석인지 불참인지 우리가 모른다"이다. 총무가 몇 해 동안
 * 엑셀에 센 건 답을 했나 안 했나뿐이라, 그 자료를 옮기면 이 상태가 된다.
 * 참석으로 바꿔 넣으면 안 된다 — 다음 주 라인업이 그 거짓말 위에서 짜인다.
 *
 * late 는 화면에서 뺐다. 카톡 투표에 지각 칸이 없어서 아무도 안 눌렀다.
 * 예전에 적어 둔 기록을 지우지 않으려고 값만 남겨 뒀다.
 */
export type AttendanceStatus = 'attending' | 'absent' | 'late' | 'voted' | 'unknown';

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
  /** 회비가 어느 달 몫인지. YYYY-MM. 여러 달치면 첫 달. 회비가 아니면 null. */
  period: string | null;
  /**
   * 이 한 줄이 몇 달치인지. 보통 1, 연납이면 12.
   *
   * 금액을 달수로 나누지 않는다 — 연납은 할인이라서 나누면 매달 조금씩 모자란
   * 것처럼 보인다. 달수는 "이 달이 채워졌는가"를 판단하는 데만 쓴다.
   */
  months: number;
  /** YYYY-MM-DD */
  occurredOn: string;
  memo: string | null;
  /** 영수증·찬조 캡처. 나중에 "이 돈이 뭐였지"를 되짚을 수 있어야 한다. */
  photoUri: string | null;
  photoPath: string | null;
  source: EntrySource;
};

/**
 * 팀 물품.
 *
 * 조끼·공·콘처럼 매주 들고 나가는 것들이다. 알고 싶은 건 "몇 개 남았나" 하나뿐이라
 * 구매일·단가 같은 건 두지 않는다 — 칸이 늘면 아무도 안 채운다.
 */
export type InventoryItem = {
  id: string;
  teamId: string;
  name: string;
  quantity: number;
  note: string | null;
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

/** 자체경기라 한 판에 두 팀이 선다. 상대 팀이 따로 없다. */
export type LineupSide = 'A' | 'B';

/**
 * 한 쿼터, 한 팀의 라인업.
 *
 * 라인업은 운동장 화이트보드에서 짜고 사진으로 들어온다. 이 앱이 하는 일은
 * 그 사진을 옮겨 적고 손으로 고칠 수 있게 하는 것이다.
 * (경기, 쿼터, 팀) 하나에 하나씩 있다.
 */
export type Lineup = {
  id: string;
  matchId: string;
  /** 1부터. 조기축구는 보통 3~4쿼터를 돈다. */
  quarter: number;
  side: LineupSide;
  formationId: string;
  slots: LineupSlot[];
  /** 화이트보드 사진. 나중에 원본을 다시 볼 수 있어야 한다. */
  photoUri: string | null;
  photoPath: string | null;
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
  /** (경기, 쿼터, 팀) 하나에 하나. 출전 기록은 여기서 계산한다. */
  lineups: Lineup[];
  potmVotes: PotmVote[];
  inventory: InventoryItem[];
};
