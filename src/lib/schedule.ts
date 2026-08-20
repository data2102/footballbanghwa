import { todayISO, uid } from '@/lib/format';
import type { Match } from '@/lib/types';

/**
 * 정기 경기 일정.
 *
 * 이 팀은 매주 일요일 아침에 자체경기를 한다. 상대 팀이 없으니 opponent 는 비운다.
 * 한 해치를 미리 깔아 두면 참석·출전 화면에서 날짜를 고르기만 하면 된다 —
 * 매주 경기를 새로 만들게 하면 결국 아무도 안 만든다.
 */
export const KICKOFF = '06:00';
export const HOME_GROUND = '자체경기';

/** 그 해의 모든 일요일. YYYY-MM-DD. */
export function sundaysOf(year: number): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(year, 0, 1));
  // 첫 일요일까지 민다.
  cursor.setUTCDate(cursor.getUTCDate() + ((7 - cursor.getUTCDay()) % 7));
  while (cursor.getUTCFullYear() === year) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return days;
}

/**
 * 한 해치 일요일 경기를 만든다. 이미 그 날짜에 경기가 있으면 건너뛴다.
 *
 * 지난 날짜는 finished 로 둔다 — 참석·기록을 적을 수 있어야 하고,
 * 앞으로 있을 경기와 섞이면 안 된다.
 */
export function weeklyMatches(
  year: number,
  teamId: string,
  existing: Match[],
  venue = HOME_GROUND,
): Match[] {
  const taken = new Set(existing.map((match) => match.date));
  const today = todayISO();

  return sundaysOf(year)
    .filter((date) => !taken.has(date))
    .map((date) => ({
      id: uid(),
      teamId,
      date,
      kickoff: KICKOFF,
      venue,
      opponent: null,
      status: date < today ? ('finished' as const) : ('scheduled' as const),
      note: null,
      shareToken: null,
    }));
}

/** 오늘에 가장 가까운 경기. 목록을 열었을 때 여기로 스크롤한다. */
export function nearestMatchIndex(sortedDates: string[]): number {
  const today = todayISO();
  const index = sortedDates.findIndex((date) => date >= today);
  return index === -1 ? Math.max(0, sortedDates.length - 1) : index;
}

export type CalendarCell = { date: string | null; hasMatch: boolean; isToday: boolean };

/**
 * 한 달치 달력 칸. 앞뒤 빈칸을 채워서 요일이 맞게 떨어지도록 한다.
 * 라이브러리를 붙이지 않는 이유는, 필요한 게 "경기 있는 날 고르기" 하나뿐이라서다.
 */
export function monthGrid(year: number, month: number, matchDates: Set<string>): CalendarCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = first.getUTCDay();
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const today = todayISO();

  const cells: CalendarCell[] = Array.from({ length: lead }, () => ({
    date: null,
    hasMatch: false,
    isToday: false,
  }));

  for (let day = 1; day <= length; day += 1) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ date, hasMatch: matchDates.has(date), isToday: date === today });
  }
  return cells;
}
