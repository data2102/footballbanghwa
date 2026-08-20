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

export const KIND_LABEL: Record<MessageTemplateKind, string> = {
  attendance: '참석',
  dues: '회비',
  notice: '공지',
};
