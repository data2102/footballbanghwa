import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildSeed, SEED_VERSION } from '@/lib/seed';
import { toDataUri, type PickedPhoto } from '@/lib/photo';
import type {
  AppData,
  Attendance,
  InventoryItem,
  Ledger,
  MessageTemplate,
  Lineup,
  Match,
  MatchEvent,
  Member,
  PotmVote,
  Team,
} from '@/lib/types';
import type { Repo } from './types';

const KEY = 'footballbanghwa:data:v1';
/** 저장된 데모 데이터가 어느 판의 시드에서 나왔는지. 판이 다르면 버린다. */
const SEED_KEY = 'footballbanghwa:seed-version';

/**
 * 기기 저장소만 쓰는 구현. Supabase 환경변수가 없을 때 선택된다.
 * 전체 데이터를 한 덩어리로 읽고 쓰는데, 조기축구 한 팀 규모(수십 명·수백 건)에서는 충분하다.
 */
export class LocalRepo implements Repo {
  readonly kind = 'local' as const;
  private cache: AppData | null = null;

  /**
   * 저장소를 쓸 수 없는 환경(사파리 프라이빗, iframe 안, 용량 초과)에서는
   * 메모리에만 들고 간다. 저장이 안 된다고 앱이 안 뜨면 안 된다.
   */
  private persistent = true;

  async load(): Promise<AppData> {
    let raw: string | null = null;
    let storedSeed: string | null = null;
    try {
      raw = await AsyncStorage.getItem(KEY);
      storedSeed = await AsyncStorage.getItem(SEED_KEY);
    } catch {
      this.persistent = false;
    }

    /*
     * 시드가 바뀌면 예시 데이터를 새로 깔고 싶다. 명단을 고쳐도 이미 앱을 열어 본
     * 사람에게는 옛 명단이 보이기 때문이다.
     *
     * 그런데 **직접 적어 둔 게 있으면 버리면 안 된다.** 문구 초안이나 회비 한 줄은
     * 예시가 아니라 그 사람 일이다. 전에는 판이 바뀔 때마다 통째로 버려서,
     * 새 판을 올릴 때마다 사용자가 적은 게 사라졌다 — "자꾸 초기화된다"가 이거였다.
     *
     * 그래서 판이 달라도 사용자가 만든 줄이 하나라도 있으면 저장된 값을 그대로 쓴다.
     */
    if (raw && storedSeed !== String(SEED_VERSION) && !LocalRepo.hasOwnRows(raw)) {
      raw = null;
    }

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<AppData>;
        this.cache = LocalRepo.backfill(parsed);
        // 판이 달라도 남겨 둔 경우다. 다음에 또 묻지 않게 지금 판으로 표시해 둔다.
        if (storedSeed !== String(SEED_VERSION)) await this.flush();
        return this.cache;
      } catch {
        // 저장된 값이 깨졌으면 시드로 되돌린다.
      }
    }
    this.cache = buildSeed();
    await this.flush();
    return this.cache;
  }

  /**
   * 예전 판이 저장해 둔 값에는 나중에 생긴 배열이 없다. 없으면 빈 배열로 채운다 —
   * 여기서 안 막으면 화면들이 undefined 를 순회하다 터진다.
   */
  private static backfill(parsed: Partial<AppData>): AppData {
    const seed = buildSeed();
    return {
      team: { ...seed.team, ...parsed.team },
      members: parsed.members ?? [],
      attendance: parsed.attendance ?? [],
      // 연납·영수증이 생기기 전에 저장된 줄에는 이 칸들이 없다.
      ledger: (parsed.ledger ?? []).map((row) => ({
        ...row,
        months: row.months ?? 1,
        photoUri: row.photoUri ?? null,
        photoPath: row.photoPath ?? null,
      })),
      events: parsed.events ?? [],
      lineups: parsed.lineups ?? [],
      potmVotes: parsed.potmVotes ?? [],
      inventory: parsed.inventory ?? [],
      templates: parsed.templates ?? [],
      matches: (parsed.matches ?? []).map((match) => ({ ...match, shareToken: match.shareToken ?? null })),
    };
  }

  /**
   * 저장된 값에 사용자가 직접 만든 줄이 있는지.
   *
   * 시드가 만드는 id 는 정해져 있다(m1, tpl-1, inv-vest ...). 거기 없는 id 가 보이면
   * 사람이 앱에서 만든 것이다. 하나라도 있으면 시드를 다시 깔지 않는다.
   */
  private static hasOwnRows(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as Partial<AppData>;
      const seed = buildSeed();
      const known = new Set<string>();
      for (const list of LocalRepo.collections(seed)) {
        for (const row of list) known.add(row.id);
      }
      return LocalRepo.collections(parsed).some((list) => list.some((row) => !known.has(row.id)));
    } catch {
      return false;
    }
  }

  /** id 를 가진 배열들. 시드와 저장본을 같은 방식으로 훑는다. */
  private static collections(data: Partial<AppData>): { id: string }[][] {
    return [
      data.members ?? [],
      data.matches ?? [],
      data.attendance ?? [],
      data.ledger ?? [],
      data.events ?? [],
      data.lineups ?? [],
      data.potmVotes ?? [],
      data.inventory ?? [],
      data.templates ?? [],
    ];
  }

  private async flush(): Promise<void> {
    if (!this.cache || !this.persistent) return;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(this.cache));
      await AsyncStorage.setItem(SEED_KEY, String(SEED_VERSION));
    } catch {
      // 한 번 실패하면 이후로는 시도하지 않는다. 매 입력마다 예외를 던질 이유가 없다.
      this.persistent = false;
    }
  }

  private async mutate(fn: (data: AppData) => void): Promise<void> {
    if (!this.cache) await this.load();
    if (!this.cache) return;
    fn(this.cache);
    await this.flush();
  }

  /** id가 같은 행은 덮어쓰고, 없으면 추가한다. */
  private static upsert<T extends { id: string }>(list: T[], rows: T[]): T[] {
    const next = [...list];
    for (const row of rows) {
      const index = next.findIndex((item) => item.id === row.id);
      if (index >= 0) next[index] = row;
      else next.push(row);
    }
    return next;
  }

  saveTeam = (team: Team) => this.mutate((data) => void (data.team = team));

  saveMember = (member: Member) =>
    this.mutate((data) => void (data.members = LocalRepo.upsert(data.members, [member])));

  /** 기기 저장소에는 스토리지가 없으니 data URI 를 그대로 들고 있는다. */
  async saveMemberPhoto(_member: Member, photo: PickedPhoto) {
    return { photoUri: toDataUri(photo), photoPath: null };
  }

  removeMember = (id: string) =>
    this.mutate((data) => void (data.members = data.members.filter((m) => m.id !== id)));

  saveMatch = (match: Match) =>
    this.mutate((data) => void (data.matches = LocalRepo.upsert(data.matches, [match])));

  saveAttendance = (rows: Attendance[]) =>
    this.mutate((data) => void (data.attendance = LocalRepo.upsert(data.attendance, rows)));

  removeAttendance = (matchId: string, memberIds: string[]) =>
    this.mutate((data) => {
      const drop = new Set(memberIds);
      data.attendance = data.attendance.filter(
        (row) => !(row.matchId === matchId && drop.has(row.memberId)),
      );
    });

  saveLedger = (rows: Ledger[]) =>
    this.mutate((data) => void (data.ledger = LocalRepo.upsert(data.ledger, rows)));

  removeLedger = (id: string) =>
    this.mutate((data) => void (data.ledger = data.ledger.filter((row) => row.id !== id)));

  /** 기기 저장소에는 스토리지가 없으니 data URI 를 그대로 들고 있는다. */
  async saveLedgerPhoto(_entry: Ledger, photo: PickedPhoto) {
    return { photoUri: toDataUri(photo), photoPath: null };
  }

  saveInventory = (item: InventoryItem) =>
    this.mutate((data) => void (data.inventory = LocalRepo.upsert(data.inventory, [item])));

  removeInventory = (id: string) =>
    this.mutate((data) => void (data.inventory = data.inventory.filter((row) => row.id !== id)));

  saveTemplate = (template: MessageTemplate) =>
    this.mutate((data) => void (data.templates = LocalRepo.upsert(data.templates, [template])));

  removeTemplate = (id: string) =>
    this.mutate((data) => void (data.templates = data.templates.filter((row) => row.id !== id)));

  saveEvents = (rows: MatchEvent[]) =>
    this.mutate((data) => void (data.events = LocalRepo.upsert(data.events, rows)));

  removeEvent = (id: string) =>
    this.mutate((data) => void (data.events = data.events.filter((row) => row.id !== id)));

  saveLineup = (lineup: Lineup) =>
    this.mutate((data) => {
      // (경기, 쿼터, 팀) 하나에 하나다.
      data.lineups = [
        ...data.lineups.filter(
          (row) =>
            !(
              row.matchId === lineup.matchId &&
              row.quarter === lineup.quarter &&
              row.side === lineup.side
            ),
        ),
        lineup,
      ];
    });

  removeLineup = (id: string) =>
    this.mutate((data) => void (data.lineups = data.lineups.filter((row) => row.id !== id)));

  /** 기기 저장소에는 스토리지가 없으니 data URI 를 그대로 들고 있는다. */
  async saveLineupPhoto(_lineup: Lineup, photo: PickedPhoto) {
    return { photoUri: toDataUri(photo), photoPath: null };
  }

  setPotmVote = (matchId: string, ballot: string, vote: PotmVote | null) =>
    this.mutate((data) => {
      const rest = data.potmVotes.filter(
        (row) => !(row.matchId === matchId && row.ballot === ballot),
      );
      data.potmVotes = vote ? [...rest, vote] : rest;
    });

  /** 데모 데이터를 초기 상태로 되돌린다. 설정 화면에서 쓴다. */
  async reset(): Promise<AppData> {
    await AsyncStorage.removeItem(KEY);
    await AsyncStorage.removeItem(SEED_KEY);
    this.cache = null;
    return this.load();
  }
}
