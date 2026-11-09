import type { AgeBand, AgeHalf, Member } from '@/lib/types';

/**
 * 회원 탭의 연령대별 명단·유니폼 현황이 쓰는 계산.
 *
 * 화면 밖에 둔 이유 — 묶다가 한 명이 갈 데가 없어 빠져도 화면은 멀쩡해 보인다.
 * 아흔 명 중 하나가 안 보이는 건 눈으로 못 잡으니, 계산만 떼어 두고 합계를 맞춰 본다.
 * 모든 묶음은 "어디에도 안 들어간 사람" 칸을 따로 두어서 합이 명단 수와 같다.
 */

/** 나이 많은 쪽부터. 조기축구는 60대가 몇 명인지가 먼저 궁금하다. */
export const BAND_ORDER: AgeBand[] = ['60', '50', '40', '30', '20'];

export const HALF_LABEL: Record<AgeHalf, string> = { early: '초반', late: '후반' };

/** 같은 연령대 안에서도 후반(나이 많은 쪽)이 먼저다. */
const HALF_ORDER: (AgeHalf | null)[] = ['late', 'early', null];

export type AgeGroup = {
  /** null 은 연령대를 안 적은 사람들. */
  band: AgeBand | null;
  halves: { half: AgeHalf | null; members: Member[] }[];
  total: number;
};

const byName = (a: Member, b: Member) => a.name.localeCompare(b.name, 'ko');

export function groupByAge(members: Member[]): AgeGroup[] {
  const bands: (AgeBand | null)[] = [...BAND_ORDER, null];
  return bands
    .map((band) => {
      const inBand = members.filter((member) => member.ageBand === band);
      const halves = HALF_ORDER.map((half) => ({
        half,
        members: inBand.filter((member) => (member.ageHalf ?? null) === half).sort(byName),
      })).filter((row) => row.members.length > 0);
      return { band, halves, total: inBand.length };
    })
    .filter((group) => group.total > 0);
}

/** "60대 후반", "40대", "연령대 모름" */
export function ageLabel(band: AgeBand | null, half: AgeHalf | null = null): string {
  if (!band) return '연령대 모름';
  return half ? `${band}대 ${HALF_LABEL[half]}` : `${band}대`;
}

// ------------------------------------------------------------ 유니폼

/** 화면에 늘어놓는 사이즈 차례. 여기 없는 값(예: '95')은 뒤에 적힌 그대로 붙는다. */
export const SIZE_ORDER = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

/**
 * 손으로 적은 사이즈를 한 모양으로. 'xl', ' XL ', 'XXL' 이 각각 다른 칸이 되면
 * 주문 수량이 갈려서 합이 안 맞는다. 빈칸·공백만 있으면 모름(null)이다.
 */
export function normalizeSize(raw: string | null | undefined): string | null {
  const text = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!text) return null;
  const xs = /^(X+)L$/.exec(text);
  if (xs && xs[1].length >= 2) return `${xs[1].length}XL`;
  return text;
}

function sizeRank(size: string): number {
  const index = SIZE_ORDER.indexOf(size);
  return index === -1 ? SIZE_ORDER.length : index;
}

export type SizeRow = { size: string; top: number; bottom: number };

/**
 * 사이즈별 상·하 수량. 모르는 사람은 `unknownTop`/`unknownBottom` 으로 따로 센다 —
 * 표에서 빼 버리면 주문을 넣을 때 그 사람 몫이 조용히 빠진다.
 */
export function sizeTable(members: Member[]): {
  rows: SizeRow[];
  unknownTop: number;
  unknownBottom: number;
} {
  const map = new Map<string, SizeRow>();
  let unknownTop = 0;
  let unknownBottom = 0;
  for (const member of members) {
    const top = normalizeSize(member.topSize);
    const bottom = normalizeSize(member.bottomSize);
    if (top) {
      const row = map.get(top) ?? { size: top, top: 0, bottom: 0 };
      row.top += 1;
      map.set(top, row);
    } else unknownTop += 1;
    if (bottom) {
      const row = map.get(bottom) ?? { size: bottom, top: 0, bottom: 0 };
      row.bottom += 1;
      map.set(bottom, row);
    } else unknownBottom += 1;
  }
  const rows = [...map.values()].sort(
    (a, b) => sizeRank(a.size) - sizeRank(b.size) || a.size.localeCompare(b.size),
  );
  return { rows, unknownTop, unknownBottom };
}

export type UniformState = 'issued' | 'pending' | 'unknown';

export function uniformState(member: Member): UniformState {
  if (member.uniformIssued === true) return 'issued';
  if (member.uniformIssued === false) return 'pending';
  return 'unknown';
}

export const UNIFORM_LABEL: Record<UniformState, string> = {
  issued: '받음',
  pending: '미지급',
  unknown: '모름',
};

/** 등번호가 겹치는 사람들. 새 유니폼을 맞출 때 번호부터 정리해야 한다. */
export function duplicateNumbers(members: Member[]): { number: number; members: Member[] }[] {
  const map = new Map<number, Member[]>();
  for (const member of members) {
    if (member.backNumber == null) continue;
    map.set(member.backNumber, [...(map.get(member.backNumber) ?? []), member]);
  }
  return [...map.entries()]
    .filter(([, list]) => list.length > 1)
    .sort(([a], [b]) => a - b)
    .map(([number, list]) => ({ number, members: list.sort(byName) }));
}

/** 단톡방·업체에 보낼 사이즈 집계 글. */
export function sizeSummaryText(teamName: string, members: Member[]): string {
  const { rows, unknownTop, unknownBottom } = sizeTable(members);
  const lines = [`[${teamName}] 유니폼 사이즈 집계 (${members.length}명)`, ''];
  for (const row of rows) lines.push(`${row.size}  상의 ${row.top} · 하의 ${row.bottom}`);
  if (unknownTop || unknownBottom) lines.push(`모름  상의 ${unknownTop} · 하의 ${unknownBottom}`);
  const pending = members.filter((member) => member.uniformIssued === false);
  if (pending.length) {
    lines.push('', `아직 못 받은 분 ${pending.length}명`);
    lines.push(
      pending
        .sort(byName)
        .map((member) => {
          const size = [normalizeSize(member.topSize), normalizeSize(member.bottomSize)];
          return size[0] || size[1] ? `${member.name}(${size[0] ?? '?'}/${size[1] ?? '?'})` : member.name;
        })
        .join(', '),
    );
  }
  return lines.join('\n');
}
