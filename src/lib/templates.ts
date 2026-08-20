import { formatDate, formatPeriod, thisPeriod, won } from '@/lib/format';
import { duesForPeriod, focusMatch, tallyAttendance, unrespondedMembers } from '@/lib/selectors';
import type { AppData, Match, MessageTemplate, MessageTemplateKind } from '@/lib/types';

/**
 * 저장해 둔 문구의 빈자리를 그 주 값으로 채운다.
 *
 * 문장을 통째로 저장하면 "매번 쓰기 귀찮다"가 안 풀린다 — 날짜와 인원이 매주 바뀌니
 * 결국 매번 고치게 된다. `{날짜}` 처럼 자리만 두면 꺼낼 때마다 앱이 채운다.
 *
 * 모르는 값은 지우지 않고 자리 그대로 남긴다. 조용히 비우면 "8월 명이 참석"처럼
 * 말이 안 되는 문장이 단톡방으로 나가는데, 자리가 남아 있으면 사람이 알아채고 고친다.
 */

export type Slot = {
  /** 본문에 적는 이름. 중괄호는 뺀 값. */
  key: string;
  help: string;
  /** 어느 종류의 문구에서 뜻이 있는지. 비어 있으면 어디서나. */
  kinds?: MessageTemplateKind[];
};

/** 넣을 수 있는 자리들. 문구 편집 화면에서 이 목록을 눌러 넣는다. */
export const SLOTS: Slot[] = [
  { key: '팀', help: '팀 이름' },
  { key: '날짜', help: '다음 경기 날짜 · 8월 23일 (일)', kinds: ['attendance', 'notice'] },
  { key: '시간', help: '경기 시작 시각 · 06:00', kinds: ['attendance', 'notice'] },
  { key: '장소', help: '경기 장소', kinds: ['attendance', 'notice'] },
  { key: '참석', help: '지금까지 참석 인원', kinds: ['attendance', 'notice'] },
  { key: '미투표', help: '아직 답 안 한 인원 수', kinds: ['attendance', 'notice'] },
  { key: '미투표명단', help: '아직 답 안 한 사람 이름', kinds: ['attendance', 'notice'] },
  { key: '달', help: '이번 달 · 2026년 8월', kinds: ['dues', 'notice'] },
  { key: '월회비', help: '월 회비 금액', kinds: ['dues', 'notice'] },
  { key: '연납', help: '연납 금액', kinds: ['dues', 'notice'] },
  { key: '미납', help: '아직 안 낸 인원 수', kinds: ['dues', 'notice'] },
  { key: '미납명단', help: '아직 안 낸 사람 이름', kinds: ['dues', 'notice'] },
  { key: '미납액', help: '아직 안 걷힌 금액 합계', kinds: ['dues', 'notice'] },
];

/** 그 종류의 문구에서 쓸 수 있는 자리만. */
export function slotsFor(kind: MessageTemplateKind): Slot[] {
  return SLOTS.filter((slot) => !slot.kinds || slot.kinds.includes(kind));
}

/** 이름을 몇 명까지 늘어놓을지. 아흔 명을 다 적으면 아무도 안 읽는다. */
const MAX_NAMES = 12;

function nameList(names: string[]): string {
  if (names.length === 0) return '없음';
  if (names.length <= MAX_NAMES) return names.join(', ');
  return `${names.slice(0, MAX_NAMES).join(', ')} 외 ${names.length - MAX_NAMES}명`;
}

/**
 * 지금 화면 상태에서 채울 수 있는 값을 모은다.
 * match 를 넘기면 그 경기를, 아니면 다음 경기를 본다.
 */
export function slotValues(data: AppData, match?: Match | null): Record<string, string> {
  const target = match ?? focusMatch(data.matches);
  const period = thisPeriod();
  const dues = duesForPeriod(data, period);
  const unpaid = dues.filter((row) => row.outstanding > 0);

  const values: Record<string, string> = {
    팀: data.team.name,
    달: formatPeriod(period),
    월회비: won(data.team.monthlyDue),
    연납: won(data.team.annualDue),
    미납: `${unpaid.length}`,
    미납명단: nameList(unpaid.map((row) => row.member.name)),
    미납액: won(unpaid.reduce((sum, row) => sum + row.outstanding, 0)),
  };

  if (target) {
    const tally = tallyAttendance(data, target.id);
    const pending = unrespondedMembers(data, target.id);
    values.날짜 = formatDate(target.date);
    values.시간 = target.kickoff;
    values.장소 = target.venue;
    values.참석 = `${tally.attending + tally.late}`;
    values.미투표 = `${pending.length}`;
    values.미투표명단 = nameList(pending.map((member) => member.name));
  }

  return values;
}

/** `{날짜}` 를 값으로 바꾼다. 값이 없는 자리는 그대로 남긴다. */
export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{([^{}]+)\}/g, (whole, key: string) => values[key.trim()] ?? whole);
}

/**
 * 붙여넣은 글에서 이번 주 값을 찾아 자리로 되돌린다. `fillTemplate` 의 반대다.
 *
 * 지난주 단톡방 글을 그대로 붙여넣으면 날짜와 인원이 박혀 있어서 다음 주에 못 쓴다.
 * 그걸 사람이 일일이 지우고 {날짜} 를 넣게 하면 결국 아무도 안 쓴다.
 *
 * 숫자만 있는 값(참석 인원 같은 것)은 "12명" 처럼 단위까지 붙었을 때만 바꾼다.
 * 그냥 12 를 바꾸면 글에 있는 다른 12 까지 자리로 둔갑한다.
 */
const COUNT_SLOTS: Record<string, string> = {
  참석: '명',
  미투표: '명',
  미납: '명',
};

export function slotifyTemplate(text: string, values: Record<string, string>): string {
  // 긴 값부터 바꾼다. 짧은 값이 먼저 걸리면 긴 값이 조각나서 안 맞는다.
  const entries = Object.entries(values)
    .filter(([, value]) => value && value !== '없음')
    .sort((a, b) => b[1].length - a[1].length);

  let out = text;
  for (const [key, value] of entries) {
    const unit = COUNT_SLOTS[key];
    // 이미 자리로 들어간 곳은 건드리지 않는다.
    if (unit) {
      if (!/^\d+$/.test(value)) continue;
      out = out.split(`${value}${unit}`).join(`{${key}}${unit}`);
    } else {
      out = out.split(value).join(`{${key}}`);
    }
  }
  return out;
}

/** 채우고 나서도 남아 있는 자리들. 화면에서 "이건 못 채웠어요"를 알릴 때 쓴다. */
export function unfilledSlots(filled: string): string[] {
  return [...new Set([...filled.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim()))];
}

/** 최근 쓴 순, 그 다음 이름 순. 매주 쓰는 문구가 늘 맨 앞에 있게 한다. */
export function orderTemplates(templates: MessageTemplate[], kind?: MessageTemplateKind) {
  return templates
    .filter((row) => !kind || row.kind === kind)
    .sort((a, b) => {
      if (a.usedAt !== b.usedAt) return (b.usedAt ?? '').localeCompare(a.usedAt ?? '');
      return a.title.localeCompare(b.title, 'ko');
    });
}

/**
 * 처음 여는 팀에 넣어 주는 세 벌.
 *
 * 빈 화면에 "적어 보세요"만 있으면 무엇을 어떻게 적으라는 건지 알 수 없다.
 * 자리를 실제로 써 둔 글이 하나 있어야 "이렇게 쓰는 거구나"가 한눈에 보인다.
 */
export const STARTER_TEMPLATES: { title: string; kind: MessageTemplateKind; body: string }[] = [
  {
    title: '주중 참석 독촉',
    kind: 'attendance',
    body: [
      '{팀} 이번 주 경기 안내드려요.',
      '{날짜} {시간} · {장소}',
      '지금까지 {참석}명 참석이에요.',
      '아직 답 안 주신 분: {미투표명단}',
      '라인업을 미리 짜야 해서요, 참석 여부만 남겨 주시면 고맙겠습니다.',
    ].join('\n'),
  },
  {
    title: '월 회비 안내',
    kind: 'dues',
    body: [
      '{달} 회비 안내드려요.',
      '월 회비는 {월회비}, 연납은 {연납}이에요.',
      '아직 {미납}명이 안 내셨어요. 남은 금액은 모두 {미납액}이에요.',
      '계좌는 공지 참고해 주세요.',
    ].join('\n'),
  },
  {
    title: '우천 취소',
    kind: 'notice',
    body: [
      '{팀} {날짜} 경기 취소 안내드려요.',
      '비가 와서 구장을 쓸 수 없게 됐어요.',
      '다음 주 같은 시간에 뵐게요.',
    ].join('\n'),
  },
];

export const KIND_LABEL: Record<MessageTemplateKind, string> = {
  attendance: '참석',
  dues: '회비',
  notice: '공지',
};
