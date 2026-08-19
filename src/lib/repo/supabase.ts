import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AppData,
  Attendance,
  Ledger,
  Lineup,
  Match,
  MatchEvent,
  Member,
  Team,
} from '@/lib/types';
import type { Repo } from './types';

/** 로그인한 사용자가 속한 첫 번째 팀의 데이터를 통째로 읽고 쓴다. */
export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const;
  private teamId: string | null = null;

  constructor(private readonly client: SupabaseClient) {}

  async load(): Promise<AppData> {
    const { data: teams, error: teamError } = await this.client.rpc('my_teams');
    if (teamError) throw teamError;
    if (!teams?.length) throw new Error('NO_TEAM');

    const teamRow = teams[0] as { id: string; name: string; monthly_due: number; invite_code: string };
    this.teamId = teamRow.id;

    const [members, matches, ledger] = await Promise.all([
      this.client.from('members').select('*').eq('team_id', teamRow.id),
      this.client.from('matches').select('*').eq('team_id', teamRow.id).order('date', { ascending: false }),
      this.client.from('ledger').select('*').eq('team_id', teamRow.id).order('occurred_on', { ascending: false }),
    ]);
    for (const result of [members, matches, ledger]) {
      if (result.error) throw result.error;
    }

    const matchIds = (matches.data ?? []).map((row: { id: string }) => row.id);
    // 경기가 하나도 없으면 in() 호출을 건너뛴다(빈 배열 in은 불필요한 왕복이다).
    const [attendance, events, lineups] = matchIds.length
      ? await Promise.all([
          this.client.from('attendance').select('*').in('match_id', matchIds),
          this.client.from('match_events').select('*').in('match_id', matchIds),
          this.client.from('lineups').select('*').in('match_id', matchIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    for (const result of [attendance, events, lineups]) {
      if (result.error) throw result.error;
    }

    return {
      team: {
        id: teamRow.id,
        name: teamRow.name,
        monthlyDue: teamRow.monthly_due,
        inviteCode: teamRow.invite_code,
      },
      members: (members.data ?? []).map(fromMemberRow),
      matches: (matches.data ?? []).map(fromMatchRow),
      attendance: (attendance.data ?? []).map(fromAttendanceRow),
      ledger: (ledger.data ?? []).map(fromLedgerRow),
      events: (events.data ?? []).map(fromEventRow),
      lineups: (lineups.data ?? []).map(fromLineupRow),
    };
  }

  private assertLoaded(): string {
    if (!this.teamId) throw new Error('팀 정보를 먼저 불러와야 합니다.');
    return this.teamId;
  }

  private async run(promise: PromiseLike<{ error: unknown }>): Promise<void> {
    const { error } = await promise;
    if (error) throw error;
  }

  saveTeam = (team: Team) =>
    this.run(
      this.client.from('teams').update({ name: team.name, monthly_due: team.monthlyDue }).eq('id', team.id),
    );

  saveMember = (member: Member) =>
    this.run(
      this.client.from('members').upsert({
        id: member.id,
        team_id: this.assertLoaded(),
        name: member.name,
        nickname: member.nickname,
        role: member.role,
        back_number: member.backNumber,
        preferred_position: member.preferredPosition,
        active: member.active,
      }),
    );

  removeMember = (id: string) =>
    // 기록이 딸린 회원은 지우지 않고 비활성으로만 돌린다.
    this.run(this.client.from('members').update({ active: false }).eq('id', id));

  saveMatch = (match: Match) =>
    this.run(
      this.client.from('matches').upsert({
        id: match.id,
        team_id: this.assertLoaded(),
        date: match.date,
        kickoff: match.kickoff,
        venue: match.venue,
        opponent: match.opponent,
        status: match.status,
        note: match.note,
      }),
    );

  saveAttendance = (rows: Attendance[]) =>
    this.run(
      this.client.from('attendance').upsert(
        rows.map((row) => ({
          match_id: row.matchId,
          member_id: row.memberId,
          status: row.status,
          note: row.note,
          source: row.source,
          updated_at: new Date().toISOString(),
        })),
        // 같은 경기·같은 사람의 참석은 한 행만 존재한다.
        { onConflict: 'match_id,member_id' },
      ),
    );

  saveLedger = (rows: Ledger[]) =>
    this.run(
      this.client.from('ledger').upsert(
        rows.map((row) => ({
          id: row.id,
          team_id: this.assertLoaded(),
          member_id: row.memberId,
          kind: row.kind,
          amount: row.amount,
          period: row.period,
          occurred_on: row.occurredOn,
          memo: row.memo,
          source: row.source,
        })),
      ),
    );

  removeLedger = (id: string) => this.run(this.client.from('ledger').delete().eq('id', id));

  saveEvents = (rows: MatchEvent[]) =>
    this.run(
      this.client.from('match_events').upsert(
        rows.map((row) => ({
          id: row.id,
          match_id: row.matchId,
          member_id: row.memberId,
          type: row.type,
          minute: row.minute,
        })),
      ),
    );

  removeEvent = (id: string) => this.run(this.client.from('match_events').delete().eq('id', id));

  saveLineup = (lineup: Lineup) =>
    this.run(
      this.client.from('lineups').upsert(
        {
          match_id: lineup.matchId,
          formation_id: lineup.formationId,
          slots: lineup.slots,
          bench: lineup.benchMemberIds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'match_id' },
      ),
    );
}

// ------------------------------------------------------------ row -> 도메인

type Row = Record<string, any>;

const fromMemberRow = (row: Row): Member => ({
  id: row.id,
  teamId: row.team_id,
  name: row.name,
  nickname: row.nickname,
  role: row.role,
  backNumber: row.back_number,
  preferredPosition: row.preferred_position,
  active: row.active,
});

const fromMatchRow = (row: Row): Match => ({
  id: row.id,
  teamId: row.team_id,
  date: row.date,
  kickoff: String(row.kickoff).slice(0, 5),
  venue: row.venue,
  opponent: row.opponent,
  status: row.status,
  note: row.note,
});

const fromAttendanceRow = (row: Row): Attendance => ({
  id: row.id,
  matchId: row.match_id,
  memberId: row.member_id,
  status: row.status,
  note: row.note,
  source: row.source,
  updatedAt: row.updated_at,
});

const fromLedgerRow = (row: Row): Ledger => ({
  id: row.id,
  teamId: row.team_id,
  memberId: row.member_id,
  kind: row.kind,
  amount: row.amount,
  period: row.period,
  occurredOn: row.occurred_on,
  memo: row.memo,
  source: row.source,
});

const fromEventRow = (row: Row): MatchEvent => ({
  id: row.id,
  matchId: row.match_id,
  memberId: row.member_id,
  type: row.type,
  minute: row.minute,
});

const fromLineupRow = (row: Row): Lineup => ({
  id: row.id,
  matchId: row.match_id,
  formationId: row.formation_id,
  slots: row.slots ?? [],
  benchMemberIds: row.bench ?? [],
});
