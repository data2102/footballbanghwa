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
  status: AttendanceStatus;
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

export type ParseRequest = {
  /** 사진만 보낼 수도 있어서 비어 있을 수 있다. */
  text: string;
  /** 손으로 쓴 명단, 화이트보드 포메이션, 은행 앱 캡처 등. */
  images?: ParseImage[];
  /** 특정 기능에서 호출했다면 힌트로 넘긴다. 없으면 AI가 판단. */
  hint?: Exclude<ParseIntent, 'mixed' | 'unknown'>;
  roster: RosterEntry[];
  /** 상대 날짜("지난주 토요일") 해석 기준. YYYY-MM-DD */
  today: string;
  /** 팀 기본 월 회비(원). 금액이 생략된 입금 문자를 보정할 때 쓴다. */
  monthlyDue?: number;
};
