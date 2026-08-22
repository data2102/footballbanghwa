import { create } from 'zustand';
import { repo } from '@/lib/repo';
import { supabase } from '@/lib/supabase';
import { todayISO, uid } from '@/lib/format';
import { ballotId } from '@/lib/ballot';
import { DEFAULT_FORMATION, emptySlot } from '@/features/lineup/formations';
import { focusMatch } from '@/lib/selectors';
import type { PickedPhoto } from '@/lib/photo';
import type {
  AppData,
  Attendance,
  AttendanceStatus,
  EntrySource,
  InventoryItem,
  Ledger,
  MessageTemplate,
  Lineup,
  LineupSide,
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
  /** 마지막 저장이 실패한 이유. 화면에 띠로 뜬다. 성공하면 비운다. */
  error: string | null;
  clearError: () => void;
  data: AppData | null;
  /** 지금 화면들이 바라보는 경기. 참석·라인업·기록이 모두 이 값을 따른다. */
  activeMatchId: string | null;
  /**
   * 출전 탭이 지금 보고 있는 쿼터.
   *
   * 화이트보드 사진 화면이 "몇 쿼터에 넣을지"를 알아야 해서 화면 안에만 둘 수 없다.
   * 주소로는 못 넘긴다 — 사진을 건네주는 길과 같이 가야 하는데 그쪽이 메모리다.
   */
  activeQuarter: number;

  load: () => Promise<void>;
  /** 로그인 상태 변화를 지켜본다. 정리 함수를 돌려주므로 화면에서 그대로 해제한다. */
  watchAuth: () => () => void;
  setActiveMatch: (matchId: string) => void;
  setActiveQuarter: (quarter: number) => void;

  setAttendanceMany: (
    matchId: string,
    memberIds: string[],
    status: AttendanceStatus,
  ) => Promise<void>;
  clearAttendance: (matchId: string, memberIds: string[]) => Promise<void>;
  setAttendance: (
    matchId: string,
    memberId: string,
    status: AttendanceStatus,
    options?: { note?: string | null; source?: EntrySource },
  ) => Promise<void>;
  /**
   * 장부 한 줄. months(기본 1)와 사진은 안 넘기면 비워 둔다 —
   * 부르는 자리 대부분이 "한 달치 현금 한 줄"이라 매번 적게 하면 실수만 는다.
   */
  addLedger: (
    entry: Omit<Ledger, 'id' | 'teamId' | 'months' | 'photoUri' | 'photoPath'> & {
      months?: number;
    },
  ) => Promise<void>;
  /** 영수증·찬조 캡처를 장부 한 줄에 붙인다. */
  setLedgerPhoto: (ledgerId: string, photo: PickedPhoto) => Promise<void>;
  saveInventory: (item: Omit<InventoryItem, 'teamId'>) => Promise<void>;
  removeInventory: (id: string) => Promise<void>;
  saveTemplate: (template: Omit<MessageTemplate, 'teamId'>) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;
  /** 이 문구를 꺼내 썼다고 표시한다. 매주 쓰는 게 목록 맨 앞에 오게 하는 값이다. */
  touchTemplate: (id: string) => Promise<void>;
  removeLedger: (id: string) => Promise<void>;
  addEvent: (entry: Omit<MatchEvent, 'id'>) => Promise<void>;
  removeEvent: (id: string) => Promise<void>;
  saveLineup: (lineup: Omit<Lineup, 'id'>) => Promise<void>;
  /** 화이트보드 사진을 그 쿼터의 라인업에 붙인다. */
  setLineupPhoto: (
    matchId: string,
    quarter: number,
    side: LineupSide,
    photo: PickedPhoto,
  ) => Promise<void>;
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

/**
 * 화면을 먼저 바꿔 두고 저장은 뒤따라간다(낙관적 갱신).
 *
 * 저장이 실패하면 error 에 담는다. **화면은 이미 바뀐 뒤라 실패가 안 보인다** —
 * 그래서 이 값은 반드시 어딘가에 떠야 한다. `_layout.tsx` 가 띠로 띄운다.
 * 조용히 삼키면 총무는 저장된 줄 알고 앱을 닫고, 다음에 열면 사라져 있다.
 */
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
  activeQuarter: 1,

  clearError: () => set({ error: null }),

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
  setActiveQuarter: (quarter) => set({ activeQuarter: quarter }),

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

  /**
   * 여러 명을 같은 상태로 한 번에 저장한다.
   *
   * 한 명씩 setAttendance 를 부르면 아흔 명일 때 저장이 아흔 번 나간다.
   * 화면은 그때마다 다시 그려지고, 중간에 하나만 실패해도 어디까지 됐는지 알 수 없다.
   */
  setAttendanceMany: async (matchId, memberIds, status) => {
    const data = get().data;
    if (!data || memberIds.length === 0) return;
    const now = new Date().toISOString();
    const rows: Attendance[] = memberIds.map((memberId) => {
      const existing = data.attendance.find(
        (row) => row.matchId === matchId && row.memberId === memberId,
      );
      return {
        id: existing?.id ?? uid(),
        matchId,
        memberId,
        status,
        // 상태를 바꾸면 예전 사유는 더 이상 맞지 않는다. 지각 시각이 불참에 남으면 헷갈린다.
        note: existing?.status === status ? (existing?.note ?? null) : null,
        source: 'manual',
        updatedAt: now,
      };
    });
    const touched = new Set(rows.map((row) => row.id));
    set({
      data: {
        ...data,
        attendance: [...data.attendance.filter((row) => !touched.has(row.id)), ...rows],
      },
    });
    await persist(set, () => repo.saveAttendance(rows));
  },

  /**
   * 참석 줄을 지운다 = 그 사람을 미투표로 되돌린다.
   * 카톡 투표 화면의 "미참여" 명단을 읽어 넣을 때 쓴다.
   */
  clearAttendance: async (matchId, memberIds) => {
    const data = get().data;
    if (!data || memberIds.length === 0) return;
    const drop = new Set(memberIds);
    set({
      data: {
        ...data,
        attendance: data.attendance.filter(
          (row) => !(row.matchId === matchId && drop.has(row.memberId)),
        ),
      },
    });
    await persist(set, () => repo.removeAttendance(matchId, memberIds));
  },

  addLedger: async (entry) => {
    const data = get().data;
    if (!data) return;
    const row: Ledger = {
      months: 1,
      photoUri: null,
      photoPath: null,
      ...entry,
      id: uid(),
      teamId: data.team.id,
    };
    set({ data: { ...data, ledger: [row, ...data.ledger] } });
    await persist(set, () => repo.saveLedger([row]));
  },

  setLedgerPhoto: async (ledgerId, photo) => {
    const data = get().data;
    if (!data) return;
    const entry = data.ledger.find((item) => item.id === ledgerId);
    if (!entry) return;
    try {
      const saved = await repo.saveLedgerPhoto(entry, photo);
      const row: Ledger = { ...entry, ...saved };
      set({
        data: { ...data, ledger: data.ledger.map((item) => (item.id === row.id ? row : item)) },
      });
      await persist(set, () => repo.saveLedger([row]));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '영수증을 저장하지 못했어요.' });
    }
  },

  saveInventory: async (item) => {
    const data = get().data;
    if (!data) return;
    const row: InventoryItem = { ...item, teamId: data.team.id };
    set({
      data: {
        ...data,
        inventory: [...data.inventory.filter((entry) => entry.id !== row.id), row],
      },
    });
    await persist(set, () => repo.saveInventory(row));
  },

  removeInventory: async (id) => {
    const data = get().data;
    if (!data) return;
    set({ data: { ...data, inventory: data.inventory.filter((row) => row.id !== id) } });
    await persist(set, () => repo.removeInventory(id));
  },

  saveTemplate: async (template) => {
    const data = get().data;
    if (!data) return;
    const row: MessageTemplate = { ...template, teamId: data.team.id };
    set({
      data: {
        ...data,
        templates: [...data.templates.filter((item) => item.id !== row.id), row],
      },
    });
    await persist(set, () => repo.saveTemplate(row));
  },

  removeTemplate: async (id) => {
    const data = get().data;
    if (!data) return;
    set({ data: { ...data, templates: data.templates.filter((row) => row.id !== id) } });
    await persist(set, () => repo.removeTemplate(id));
  },

  touchTemplate: async (id) => {
    const data = get().data;
    if (!data) return;
    const found = data.templates.find((row) => row.id === id);
    if (!found) return;
    const row: MessageTemplate = { ...found, usedAt: new Date().toISOString() };
    set({
      data: { ...data, templates: data.templates.map((item) => (item.id === id ? row : item)) },
    });
    await persist(set, () => repo.saveTemplate(row));
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
    const existing = data.lineups.find(
      (row) =>
        row.matchId === lineup.matchId &&
        row.quarter === lineup.quarter &&
        row.side === lineup.side,
    );
    const row: Lineup = { ...lineup, id: existing?.id ?? uid() };
    set({
      data: {
        ...data,
        lineups: [...data.lineups.filter((item) => item.id !== row.id), row],
      },
    });
    await persist(set, () => repo.saveLineup(row));
  },

  setLineupPhoto: async (matchId, quarter, side, photo) => {
    const data = get().data;
    if (!data) return;
    const existing = data.lineups.find(
      (row) => row.matchId === matchId && row.quarter === quarter && row.side === side,
    );
    // 사진만 먼저 올리는 경우가 있다. 라인업이 아직 없으면 빈 자리로 하나 만든다.
    const base: Lineup = existing ?? {
      id: uid(),
      matchId,
      quarter,
      side,
      formationId: DEFAULT_FORMATION.id,
      slots: DEFAULT_FORMATION.slots.map(emptySlot),
      photoUri: null,
      photoPath: null,
    };
    try {
      const saved = await repo.saveLineupPhoto(base, photo);
      const row: Lineup = { ...base, ...saved };
      set({
        data: { ...data, lineups: [...data.lineups.filter((item) => item.id !== row.id), row] },
      });
      await persist(set, () => repo.saveLineup(row));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : '사진을 저장하지 못했어요.' });
    }
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

/** 화면에서 기본으로 보여 줄 쿼터 수. */
export const DEFAULT_QUARTERS = 4;

/** 이름만 알고 추가하는 회원의 나머지 기본값. 신규 회원을 만드는 곳마다 반복하지 않게 모아 둔다. */
export function blankMemberFields(): Omit<Member, 'id' | 'teamId' | 'name'> {
  return {
    nickname: null,
    aliases: [],
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
    months: 1,
    occurredOn: todayISO(),
    memo: null,
    photoUri: null,
    photoPath: null,
    source: 'manual',
  };
}
