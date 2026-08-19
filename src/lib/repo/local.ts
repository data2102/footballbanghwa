import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildSeed } from '@/lib/seed';
import { toDataUri, type PickedPhoto } from '@/lib/photo';
import type { AppData, Attendance, Ledger, Lineup, Match, MatchEvent, Member, Team } from '@/lib/types';
import type { Repo } from './types';

const KEY = 'footballbanghwa:data:v1';

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
    try {
      raw = await AsyncStorage.getItem(KEY);
    } catch {
      this.persistent = false;
    }

    if (raw) {
      try {
        this.cache = JSON.parse(raw) as AppData;
        return this.cache;
      } catch {
        // 저장된 값이 깨졌으면 시드로 되돌린다.
      }
    }
    this.cache = buildSeed();
    await this.flush();
    return this.cache;
  }

  private async flush(): Promise<void> {
    if (!this.cache || !this.persistent) return;
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(this.cache));
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

  saveLedger = (rows: Ledger[]) =>
    this.mutate((data) => void (data.ledger = LocalRepo.upsert(data.ledger, rows)));

  removeLedger = (id: string) =>
    this.mutate((data) => void (data.ledger = data.ledger.filter((row) => row.id !== id)));

  saveEvents = (rows: MatchEvent[]) =>
    this.mutate((data) => void (data.events = LocalRepo.upsert(data.events, rows)));

  removeEvent = (id: string) =>
    this.mutate((data) => void (data.events = data.events.filter((row) => row.id !== id)));

  saveLineup = (lineup: Lineup) =>
    this.mutate((data) => {
      // 경기당 라인업은 하나다.
      data.lineups = [...data.lineups.filter((row) => row.matchId !== lineup.matchId), lineup];
    });

  /** 데모 데이터를 초기 상태로 되돌린다. 설정 화면에서 쓴다. */
  async reset(): Promise<AppData> {
    await AsyncStorage.removeItem(KEY);
    this.cache = null;
    return this.load();
  }
}
