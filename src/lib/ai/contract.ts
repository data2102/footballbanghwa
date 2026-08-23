/**
 * 앱 <-> parse-text Edge Function 사이의 계약.
 * supabase/functions/_shared/schema.ts 의 JSON Schema와 반드시 같은 모양을 유지해야 한다.
 */
import type {
  AttendanceStatus,
  LedgerKind,
  MatchEventType,
  PositionGroup,
} from '@/lib/types';

export type ParseIntent =
  | 'attendance'
  | 'payment'
  | 'lineup'
  | 'event'
  | 'profile'
  | 'mixed'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';

/** AI가 참조할 수 있도록 함께 보내는 팀 명단. */
export type RosterEntry = {
  id: string;
  name: string;
  nickname: string | null;
  /** 카톡에서 쓰는 다른 이름들. 사람이 한 번 알려 준 것이라 이름보다 강한 단서다. */
  aliases: string[];
  backNumber: number | null;
  position: PositionGroup | null;
};

type ItemBase = {
  /** 명단에서 특정된 회원. 확신이 없으면 null로 두고 사용자가 고르게 한다. */
  memberId: string | null;
  /** 원문에 적힌 이름/호칭 그대로. */
  memberName: string;
  confidence: Confidence;
  /** 이 항목의 근거가 된 원문 조각. 검토 화면에 그대로 보여준다. */
  quote: string;
};

export type AttendanceItem = ItemBase & {
  kind: 'attendance';
  /**
   * DB 의 AttendanceStatus 에 'pending' 하나가 더 붙는다.
   * 카톡 투표 화면의 "미참여" 아래에 있던 사람 — 아직 투표를 안 한 사람이다.
   * 미투표는 "줄이 없음"이라, 저장할 때 새 줄을 쓰는 게 아니라 있던 줄을 지운다.
   */
  status: AttendanceStatus | 'pending';
  note: string | null;
};

export type PaymentItem = ItemBase & {
  kind: 'payment';
  ledgerKind: LedgerKind;
  amount: number;
  /** YYYY-MM, 회비가 아니면 null */
  period: string | null;
  /** YYYY-MM-DD, 모르면 null (앱에서 오늘로 채운다) */
  occurredOn: string | null;
  memo: string | null;
};

export type LineupItem = ItemBase & {
  kind: 'lineup';
  /** 포메이션 슬롯 키. 예: 'GK', 'DF2', 'FW1' */
  slotKey: string | null;
  group: PositionGroup;
  /** 몇 쿼터인지. 화이트보드에 안 적혀 있으면 null(앱이 지금 보고 있는 쿼터로 넣는다). */
  quarter: number | null;
  /** 자체경기라 한 판에 두 팀이 선다. 왼쪽/위가 A, 오른쪽/아래가 B. */
  side: 'A' | 'B' | null;
  /**
   * 판에서 몇 번째 가로줄인지. 0 이 자기 골문에 제일 가까운 줄.
   *
   * 그룹(DF/MF/FW)만으로는 4-1-2-3 처럼 줄이 넷인 판을 되살릴 수 없다 — 가운데 두 줄이
   * 한 줄로 합쳐진다. 짧은 출력 경로가 줄을 그대로 알려 주므로 그대로 들고 온다.
   * 글에서 읽은 라인업이나 예전 응답에는 없어서 null 이 될 수 있다.
   */
  line?: number | null;
};

export type EventItem = ItemBase & {
  kind: 'event';
  type: MatchEventType;
  minute: number | null;
};

/** 회원 카드 갱신. "태윤이 왼발 좋고 체력 짱" 같은 문장에서 나온다. */
export type ProfileItem = ItemBase & {
  kind: 'profile';
  /** 새로 붙일 장점 태그. 기존 태그를 지우지 않고 더한다. */
  strengths: string[];
  position: PositionGroup | null;
  backNumber: number | null;
  note: string | null;
};

export type ParsedItem = AttendanceItem | PaymentItem | LineupItem | EventItem | ProfileItem;

export type ParseResponse = {
  intent: ParseIntent;
  /** lineup 의도일 때 인식된 포메이션. 예: '4-3-3' */
  formation: string | null;
  items: ParsedItem[];
  /** 명단에서 찾지 못한 이름들. 신규 회원 등록을 유도한다. */
  unmatched: string[];
  /** 한 줄 한국어 요약. 검토 화면 상단에 띄운다. */
  summary: string;
};

/** 카메라로 찍었거나 사진첩에서 고른 이미지. Claude 가 그대로 읽는다. */
export type ParseImage = {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** data: 접두사 없는 base64. */
  data: string;
};

/**
 * "이 사진에 보이는 이름은 전부 이 칸이다" — 사람이 미리 알려 주는 값.
 *
 * 카톡 투표 화면을 통째로 올리면 말머리("불참 : 35명") 아래로 이름이 이어지는데,
 * 긴 캡처는 조각으로 잘려서 말머리 없이 이름부터 시작하는 조각이 생긴다. 그러면 모델이
 * 그 이름들을 어느 칸인지 몰라 조용히 버린다 — 불참이 아래쪽 긴 묶음이라 하필 불참만 빠진다.
 *
 * 칸별로 따로 찍어 올리고 이 값을 붙이면 **추론할 일 자체가 없어진다.** 모델은 이름만 읽는다.
 */
export type PhotoStatusHint = AttendanceStatus | 'pending';

export type ParseRequest = {
  /** 사진만 보낼 수도 있어서 비어 있을 수 있다. */
  text: string;
  /** 손으로 쓴 명단, 화이트보드 포메이션, 은행 앱 캡처 등. */
  images?: ParseImage[];
  /** 이 요청의 사진들이 전부 어느 칸인지. 없으면 모델이 화면에서 읽어 정한다. */
  statusHint?: PhotoStatusHint;
  /** 특정 기능에서 호출했다면 힌트로 넘긴다. 없으면 AI가 판단. */
  hint?: Exclude<ParseIntent, 'mixed' | 'unknown'>;
  /** 지금 보고 있는 쿼터. 사진에 쿼터가 안 적혀 있을 때 여기로 넣는다. */
  quarter?: number;
  roster: RosterEntry[];
  /** 상대 날짜("지난주 토요일") 해석 기준. YYYY-MM-DD */
  today: string;
  /** 팀 기본 월 회비(원). 금액이 생략된 입금 문자를 보정할 때 쓴다. */
  monthlyDue?: number;
};
