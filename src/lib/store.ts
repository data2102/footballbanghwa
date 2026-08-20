import { create } from 'zustand';
import { repo } from '@/lib/repo';
import { supabase } from '@/lib/supabase';
import { todayISO, uid } from '@/lib/format';
import { ballotId } from '@/lib/ballot';
import { focusMatch } from '@/lib/selectors';
import type { PickedPhoto } from '@/lib/photo';
import type {
  AppData,
  Appearance,
  Attendance,
  AttendanceStatus,
  EntrySource,
  Ledger,
  Lineup,
  Match,
  MatchEvent,
  Member,
  PotmVote,
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
  /** 로그인 상태 변화를 지켜본다. 정리 함수를 돌려주므로 화면에서 그대로 해제한다. */
  watchAuth: () => () => void;
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
  /** 한 사람이 이 경기에서 뛴 쿼터 수를 정한다. 0이면 기록을 지운다. */
  setQuarters: (matchId: string, memberId: string, count: number) => Promise<void>;
  /** MVP 한 표. 같은 사람을 다시 누르면 표를 거둔다. */
  togglePotmVote: (matchId: string, memberId: string) => Promise<void>;
  /** 이 경기의 참석 링크 토큰. 없으면 만들어서 저장한다. */
  ensureShareToken: (matchId: string) => Promise<string | null>;
  addMember: (member: Omit<Member, 'id' | 'teamId'>) => Promise<Member | null>;
  setMemberPhoto: (memberId: string, photo: PickedPhoto) => Promise<void>;
  updateMember: (member: Member) => Promise<void>;
  /** 명단에서 뺀다. 지난 기록은 그대로 남는다(저장소가 비활성으로만 돌린다). */
  removeMember: (id: string) => Promise<void>;
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

  /**
   * 메일의 로그인 링크를 누르고 돌아오면 세션은 주소(URL)에서 늦게 잡힌다.
   * 그때 이미 load() 는 끝나서 "로그인 안 됨"으로 굳어 있으므로, 여기서 다시 읽어야 한다.
   * 이게 없으면 로그인에 성공하고도 로그인 화면에 그대로 머문다.
   */
  watchAuth: () => {
    if (!supabase) return () => {};
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        if (get().status !== 'ready') get().load();
        return;
      }
      // 세션이 사라졌는데 화면은 팀 데이터를 들고 있으면 안 된다.
      if (get().status === 'ready' || get().status === 'no-team') {
        set({ status: 'signed-out', data: null, activeMatchId: null });
      }
    });
    return () => data.subscription.unsubscribe();
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

  setQuarters: async (matchId, memberId, count) => {
    const data = get().data;
    if (!data) return;
    const capped = Math.max(0, Math.min(count, MAX_QUARTERS));
    const rows: Appearance[] = Array.from({ length: capped }, (_, index) => ({
      id: uid(),
      matchId,
      memberId,
      quarter: index + 1,
      source: 'manual',
    }));
    set({
      data: {
        ...data,
        appearances: [
          ...data.appearances.filter(
            (row) => !(row.matchId === matchId && row.memberId === memberId),
          ),
          ...rows,
        ],
      },
    });
    await persist(set, () => repo.setAppearances(matchId, memberId, rows));
  },

  togglePotmVote: async (matchId, memberId) => {
    const data = get().data;
    if (!data) return;
    const ballot = await ballotId();
    const mine = data.potmVotes.find((row) => row.matchId === matchId && row.ballot === ballot);
    const next: PotmVote | null =
      mine?.memberId === memberId ? null : { id: mine?.id ?? uid(), matchId, memberId, ballot };
    set({
      data: {
        ...data,
        potmVotes: [
          ...data.potmVotes.filter((row) => !(row.matchId === matchId && row.ballot === ballot)),
          ...(next ? [next] : []),
        ],
      },
    });
    await persist(set, () => repo.setPotmVote(matchId, ballot, next));
  },

  ensureShareToken: async (matchId) => {
    const data = get().data;
    const match = data?.matches.find((row) => row.id === matchId);
    if (!data || !match) return null;
    if (match.shareToken) return match.shareToken;
    const token = uid();
    await get().saveMatch({ ...match, shareToken: token });
    return token;
  },

  addMember: async (member) => {
    const data = get().data;
    if (!data) return null;
    const row: Member = { ...member, id: uid(), teamId: data.team.id };
    set({ data: { ...data, members: [...data.members, row] } });
    await persist(set, () => repo.saveMember(row));
    return row;
  },

  setMemberPhoto: async (memberId, photo) => {
    const data = get().data;
    const member = data?.members.find((row) => row.id === memberId);
    if (!data || !member) return;
    try {
      const saved = await repo.saveMemberPhoto(member, photo);
      await get().updateMember({ ...member, ...saved });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '사진을 저장하지 못했어요.' });
    }
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

  removeMember: async (id) => {
    const data = get().data;
    if (!data) return;
    set({ data: { ...data, members: data.members.filter((row) => row.id !== id) } });
    await persist(set, () => repo.removeMember(id));
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

/** 조기축구는 보통 3~4쿼터를 돈다. 그보다 큰 값은 오타로 본다. */
export const MAX_QUARTERS = 6;

/** 이름만 알고 추가하는 회원의 나머지 기본값. 신규 회원을 만드는 곳마다 반복하지 않게 모아 둔다. */
export function blankMemberFields(): Omit<Member, 'id' | 'teamId' | 'name'> {
  return {
    nickname: null,
    role: 'player',
    backNumber: null,
    positions: [],
    ageBand: null,
    strengths: [],
    note: null,
    photoUri: null,
    photoPath: null,
    joinedOn: todayISO(),
    active: true,
  };
}

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
