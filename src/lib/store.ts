import { create } from 'zustand';
import { repo } from '@/lib/repo';
import { supabase } from '@/lib/supabase';
import { todayISO, uid } from '@/lib/format';
import { focusMatch } from '@/lib/selectors';
import type {
  AppData,
  Attendance,
  AttendanceStatus,
  EntrySource,
  Ledger,
  Lineup,
  Match,
  MatchEvent,
  Member,
  Team,
} from '@/lib/types';

/**
 * signed-out / no-team 은 Supabase 모드에서만 나온다.
 * 데모 모드는 항상 바로 ready 로 간다.
 */
type Status = 'idle' | 'loading' | 'ready' | 'error' | 'signed-out' | 'no-team';

type Store = {
  status: Status;
  error: string | null;
  data: AppData | null;
  /** 지금 화면들이 바라보는 경기. 참석·라인업·기록이 모두 이 값을 따른다. */
  activeMatchId: string | null;

  load: () => Promise<void>;
  setActiveMatch: (matchId: string) => void;

  setAttendance: (
    matchId: string,
    memberId: string,
    status: AttendanceStatus,
    options?: { note?: string | null; source?: EntrySource },
  ) => Promise<void>;
  addLedger: (entry: Omit<Ledger, 'id' | 'teamId'>) => Promise<void>;
  removeLedger: (id: string) => Promise<void>;
  addEvent: (entry: Omit<MatchEvent, 'id'>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  saveLineup: (lineup: Omit<Lineup, 'id'>) => Promise<void>;
  addMember: (member: Omit<Member, 'id' | 'teamId'>) => Promise<Member | null>;
  updateMember: (member: Member) => Promise<void>;
  saveMatch: (match: Omit<Match, 'id' | 'teamId'> & { id?: string }) => Promise<void>;
  updateTeam: (patch: Partial<Team>) => Promise<void>;
};

/** 낙관적 갱신: 화면을 먼저 바꾸고 저장한다. 실패하면 error에 남기고 다시 읽는다. */
async function persist<T>(set: (partial: Partial<Store>) => void, run: () => Promise<T>): Promise<void> {
  try {
    await run();
  } catch (error) {
    set({ error: error instanceof Error ? error.message : '저장에 실패했습니다.' });
  }
}

export const useStore = create<Store>((set, get) => ({
  status: 'idle',
  error: null,
  data: null,
  activeMatchId: null,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      if (supabase) {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) {
          set({ status: 'signed-out', data: null });
          return;
        }
      }
      const data = await repo.load();
      set({
        data,
        status: 'ready',
        activeMatchId: get().activeMatchId ?? focusMatch(data.matches)?.id ?? null,
      });
    } catch (error) {
      // 로그인은 했지만 아직 소속 팀이 없는 경우는 오류가 아니라 온보딩 단계다.
      if (error instanceof Error && error.message === 'NO_TEAM') {
        set({ status: 'no-team', data: null });
        return;
      }
      set({
        status: 'error',
        error: error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.',
      });
    }
  },

  setActiveMatch: (matchId) => set({ activeMatchId: matchId }),

  setAttendance: async (matchId, memberId, status, options) => {
    const data = get().data;
    if (!data) return;
    const existing = data.attendance.find(
      (row) => row.matchId === matchId && row.memberId === memberId,
    );
    const row: Attendance = {
      id: existing?.id ?? uid(),
      matchId,
      memberId,
      status,
      note: options?.note ?? existing?.note ?? null,
      source: options?.source ?? 'manual',
      updatedAt: new Date().toISOString(),
    };
    set({
      data: {
        ...data,
        attendance: [...data.attendance.filter((item) => item.id !== row.id), row],
      },
    });
    await persist(set, () => repo.saveAttendance([row]));
  },

  addLedger: async (entry) => {
    const data = get().data;
    if (!data) return;
    const row: Ledger = { ...entry, id: uid(), teamId: data.team.id };
    set({ data: { ...data, ledger: [row, ...data.ledger] } });
    await persist(set, () => repo.saveLedger([row]));
  },

  removeLedger: async (id) => {
    const data = get().data;
    if (!data) return;
    set({ data: { ...data, ledger: data.ledger.filter((row) => row.id !== id) } });
    await persist(set, () => repo.removeLedger(id));
  },

  addEvent: async (entry) => {
    const data = get().data;
    if (!data) return;
    const row: MatchEvent = { ...entry, id: uid() };
    set({ data: { ...data, events: [...data.events, row] } });
    await persist(set, () => repo.saveEvents([row]));
  },

  removeEvent: async (id) => {
    const data = get().data;
    if (!data) return;
    set({ data: { ...data, events: data.events.filter((row) => row.id !== id) } });
    await persist(set, () => repo.removeEvent(id));
  },

  saveLineup: async (lineup) => {
    const data = get().data;
    if (!data) return;
    const existing = data.lineups.find((row) => row.matchId === lineup.matchId);
    const row: Lineup = { ...lineup, id: existing?.id ?? uid() };
    set({
      data: {
        ...data,
        lineups: [...data.lineups.filter((item) => item.matchId !== row.matchId), row],
      },
    });
    await persist(set, () => repo.saveLineup(row));
  },

  addMember: async (member) => {
    const data = get().data;
    if (!data) return null;
    const row: Member = { ...member, id: uid(), teamId: data.team.id };
    set({ data: { ...data, members: [...data.members, row] } });
    await persist(set, () => repo.saveMember(row));
    return row;
  },

  updateMember: async (member) => {
    const data = get().data;
    if (!data) return;
    set({
      data: {
        ...data,
        members: data.members.map((row) => (row.id === member.id ? member : row)),
      },
    });
    await persist(set, () => repo.saveMember(member));
  },

  saveMatch: async (match) => {
    const data = get().data;
    if (!data) return;
    const row: Match = { ...match, id: match.id ?? uid(), teamId: data.team.id };
    set({
      data: {
        ...data,
        matches: [...data.matches.filter((item) => item.id !== row.id), row],
      },
      activeMatchId: row.id,
    });
    await persist(set, () => repo.saveMatch(row));
  },

  updateTeam: async (patch) => {
    const data = get().data;
    if (!data) return;
    const team = { ...data.team, ...patch };
    set({ data: { ...data, team } });
    await persist(set, () => repo.saveTeam(team));
  },
}));

/** 오늘 날짜의 빈 장부 항목을 만들 때 쓰는 기본값. */
export function blankLedger(): Omit<Ledger, 'id' | 'teamId'> {
  return {
    memberId: null,
    kind: 'due',
    amount: 0,
    period: todayISO().slice(0, 7),
    occurredOn: todayISO(),
    memo: null,
    source: 'manual',
  };
}
