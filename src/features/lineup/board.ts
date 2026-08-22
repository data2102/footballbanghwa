import { emptySlot, formationFromGroups } from './formations';
import type { LineupItem } from '@/lib/ai/contract';
import type { LineupSlot } from '@/lib/types';

/** 사진에서 읽어 낸 한 줄. at 은 검토 화면의 줄 번호로, 사람이 이어 준 결과를 찾는 열쇠다. */
export type BoardRow = { item: LineupItem; at: number };

/**
 * 화이트보드에서 읽어 낸 자리들을 한 팀의 판으로 옮긴다.
 *
 * 자리 수는 **읽은 그대로** 쓴다. 익숙한 4-3-3 으로 끌어다 붙이면 수비가 셋인 날에
 * 없는 자리가 하나 생기고, 다섯인 날에는 한 명이 갈 데가 없어진다.
 *
 * 명단에 없고 사람이 이어 주지도 않은 이름은 용병이다. **회원으로 만들지 않고**
 * 이름만 자리에 붙인다 — 회원으로 만들면 안 오는 사람이 매주 미납자로 뜬다.
 *
 * 화면 밖에 따로 두는 이유는 이 계산이 눈으로 안 보이기 때문이다. 한 명이라도
 * 갈 데가 없어 사라지면 판은 멀쩡해 보이고 사람만 없다.
 */
export function buildBoard(rows: BoardRow[], links: Record<number, string>) {
  const formation = formationFromGroups(rows.map(({ item }) => item.group));
  const slots: LineupSlot[] = formation.slots.map(emptySlot);
  const free = (slot: LineupSlot) => !slot.memberId && !slot.guestName;

  for (const { item, at } of rows) {
    const memberId = item.memberId || links[at] || null;
    const byKey = item.slotKey ? slots.find((slot) => slot.key === item.slotKey) : undefined;
    /*
     * 판에 적힌 자리가 이미 찼으면 같은 줄의 빈 자리로 간다. 덮어쓰면 먼저 앉은 사람이
     * 조용히 사라진다. 줄까지 다 찼으면 아무 빈 자리에라도 앉힌다 — 어긋난 자리는
     * 사람이 눈으로 보고 옮길 수 있지만, 없어진 사람은 되살릴 수 없다.
     */
    const target =
      byKey && free(byKey)
        ? byKey
        : (slots.find((slot) => slot.group === item.group && free(slot)) ?? slots.find(free));
    if (!target) continue;
    if (memberId) target.memberId = memberId;
    else target.guestName = item.memberName.trim() || '이름 미상';
  }

  return { formation, slots };
}
