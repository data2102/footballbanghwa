import type { PickedPhoto } from '@/lib/photo';
import type {
  Appearance,
  Attendance,
  AppData,
  Ledger,
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
  saveEvents(rows: MatchEvent[]): Promise<void>;
  removeEvent(id: string): Promise<void>;
  saveLineup(lineup: Lineup): Promise<void>;
  /** 한 경기·한 사람의 출전 쿼터를 통째로 바꾼다. 지우고 다시 넣는 편이 어긋날 여지가 적다. */
  setAppearances(matchId: string, memberId: string, rows: Appearance[]): Promise<void>;
  /** 한 표를 넣거나 옮긴다. ballot 하나당 경기별로 한 표만 남는다. */
  setPotmVote(matchId: string, ballot: string, vote: PotmVote | null): Promise<void>;
}
