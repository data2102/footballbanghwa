import type { Attendance, AppData, Ledger, Lineup, Match, MatchEvent, Member, Team } from '@/lib/types';

/**
 * 저장소 인터페이스. 로컬(기기 저장소)과 Supabase 두 구현이 같은 모양을 가진다.
 * 화면과 스토어는 이 인터페이스만 알고, 어느 쪽이 붙어 있는지는 신경 쓰지 않는다.
 */
export interface Repo {
  readonly kind: 'local' | 'supabase';
  load(): Promise<AppData>;
  saveTeam(team: Team): Promise<void>;
  saveMember(member: Member): Promise<void>;
  removeMember(id: string): Promise<void>;
  saveMatch(match: Match): Promise<void>;
  saveAttendance(rows: Attendance[]): Promise<void>;
  saveLedger(rows: Ledger[]): Promise<void>;
  removeLedger(id: string): Promise<void>;
  saveEvents(rows: MatchEvent[]): Promise<void>;
  removeEvent(id: string): Promise<void>;
  saveLineup(lineup: Lineup): Promise<void>;
}
