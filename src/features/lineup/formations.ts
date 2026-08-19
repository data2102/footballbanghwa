import type { PositionGroup } from '@/lib/types';

export type FormationSlot = {
  key: string;
  group: PositionGroup;
  /** 0(왼쪽) ~ 1(오른쪽) */
  x: number;
  /** 0(우리 골문) ~ 1(상대 골문) */
  y: number;
};

export type Formation = {
  id: string;
  label: string;
  /** 골키퍼 포함 총 인원. 조기축구는 8·9인제도 흔하다. */
  size: number;
  slots: FormationSlot[];
};

/** 라인별 x좌표를 균등 분배한다. 양 끝은 터치라인에서 조금 띄운다. */
function line(group: PositionGroup, count: number, y: number, spread = 0.72): FormationSlot[] {
  return Array.from({ length: count }, (_, i) => {
    const x = count === 1 ? 0.5 : 0.5 - spread / 2 + (spread * i) / (count - 1);
    return { key: `${group}${i + 1}`, group, x, y };
  });
}

const GK: FormationSlot = { key: 'GK', group: 'GK', x: 0.5, y: 0.07 };

function build(id: string, label: string, lines: [PositionGroup, number, number][]): Formation {
  const slots = [GK, ...lines.flatMap(([group, count, y]) => line(group, count, y))];
  // 같은 그룹이 여러 라인에 걸치면(예: 4-2-3-1) 키가 겹치므로 그룹 안에서 다시 번호를 매긴다.
  const counters: Record<string, number> = {};
  const renumbered = slots.map((slot) => {
    if (slot.group === 'GK') return slot;
    counters[slot.group] = (counters[slot.group] ?? 0) + 1;
    return { ...slot, key: `${slot.group}${counters[slot.group]}` };
  });
  return { id, label, size: renumbered.length, slots: renumbered };
}

export const FORMATIONS: Formation[] = [
  build('4-3-3', '4-3-3', [['DF', 4, 0.27], ['MF', 3, 0.53], ['FW', 3, 0.8]]),
  build('4-4-2', '4-4-2', [['DF', 4, 0.27], ['MF', 4, 0.53], ['FW', 2, 0.8]]),
  build('4-2-3-1', '4-2-3-1', [['DF', 4, 0.25], ['MF', 2, 0.45], ['MF', 3, 0.65], ['FW', 1, 0.85]]),
  build('3-5-2', '3-5-2', [['DF', 3, 0.27], ['MF', 5, 0.53], ['FW', 2, 0.8]]),
  build('3-4-3', '3-4-3', [['DF', 3, 0.27], ['MF', 4, 0.53], ['FW', 3, 0.8]]),
  build('3-3-1', '3-3-1 (8인)', [['DF', 3, 0.28], ['MF', 3, 0.56], ['FW', 1, 0.84]]),
  build('2-3-2', '2-3-2 (8인)', [['DF', 2, 0.28], ['MF', 3, 0.56], ['FW', 2, 0.84]]),
  build('3-3-2', '3-3-2 (9인)', [['DF', 3, 0.28], ['MF', 3, 0.56], ['FW', 2, 0.84]]),
];

export const DEFAULT_FORMATION = FORMATIONS[0];

export function findFormation(id: string | null | undefined): Formation {
  return FORMATIONS.find((formation) => formation.id === id) ?? DEFAULT_FORMATION;
}

/** AI가 "4-3-3", "433", "4 3 3" 어떤 모양으로 주든 카탈로그의 id로 맞춘다. */
export function normalizeFormationId(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.match(/\d/g);
  if (!digits || digits.length < 2) return null;
  const id = digits.join('-');
  return FORMATIONS.some((formation) => formation.id === id) ? id : null;
}
