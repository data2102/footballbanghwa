import type { PickedPhoto } from '@/lib/photo';
import type {
  Attendance,
  AppData,
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

/**
 * 저장소 인터페이스. 로컬(기기 저장소)과 Supabase 두 구현이 같은 모양을 가진다.
 * 화면과 스토어는 이 인터페이스만 알고, 어느 쪽이 붙어 있는지는 신경 쓰지 않는다.
 */
export interface Repo {
  readonly kind: 'local' | 'supabase';
  load(): Promise<AppData>;
  saveTeam(team: Team): Promise<void>;
  saveMember(member: Member): Promise<void>;
  /** 프로필 사진을 저장하고, 회원 레코드에 반영할 값을 돌려준다. */
  saveMemberPhoto(member: Member, photo: PickedPhoto): Promise<{ photoUri: string; photoPath: string | null }>;
  removeMember(id: string): Promise<void>;
  saveMatch(match: Match): Promise<void>;
  saveAttendance(rows: Attendance[]): Promise<void>;
  saveLedger(rows: Ledger[]): Promise<void>;
  removeLedger(id: string): Promise<void>;
  /** 영수증·찬조 캡처. 회원 사진과 같은 규칙으로 비공개 보관함에 넣는다. */
  saveLedgerPhoto(entry: Ledger, photo: PickedPhoto): Promise<{ photoUri: string; photoPath: string | null }>;
  saveInventory(item: InventoryItem): Promise<void>;
  removeInventory(id: string): Promise<void>;
  saveTemplate(template: MessageTemplate): Promise<void>;
  removeTemplate(id: string): Promise<void>;
  saveEvents(rows: MatchEvent[]): Promise<void>;
  removeEvent(id: string): Promise<void>;
  /** (경기, 쿼터, 팀) 하나의 라인업. 같은 자리에 다시 저장하면 덮어쓴다. */
  saveLineup(lineup: Lineup): Promise<void>;
  removeLineup(id: string): Promise<void>;
  /** 화이트보드 사진을 저장하고 라인업에 붙일 값을 돌려준다. */
  saveLineupPhoto(lineup: Lineup, photo: PickedPhoto): Promise<{ photoUri: string; photoPath: string | null }>;
  /** 한 표를 넣거나 옮긴다. ballot 하나당 경기별로 한 표만 남는다. */
  setPotmVote(matchId: string, ballot: string, vote: PotmVote | null): Promise<void>;
}
