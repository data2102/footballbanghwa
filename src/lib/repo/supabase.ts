import type { SupabaseClient } from '@supabase/supabase-js';
import type { PickedPhoto } from '@/lib/photo';
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
import {
  drainDeviceTemplates,
  isMissingTable,
  readDeviceTemplates,
  removeDeviceTemplate,
  saveDeviceTemplate,
} from './deviceTemplates';
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

    const teamRow = teams[0] as {
      id: string;
      name: string;
      monthly_due: number;
      annual_due: number | null;
      invite_code: string;
      reminder_enabled?: boolean;
      rules?: string | null;
    };
    this.teamId = teamRow.id;

    const [members, matches, ledger, inventory, templates] = await Promise.all([
      this.client.from('members').select('*').eq('team_id', teamRow.id),
      this.client.from('matches').select('*').eq('team_id', teamRow.id).order('date', { ascending: false }),
      this.client.from('ledger').select('*').eq('team_id', teamRow.id).order('occurred_on', { ascending: false }),
      this.client.from('inventory').select('*').eq('team_id', teamRow.id).order('name'),
      this.client.from('message_templates').select('*').eq('team_id', teamRow.id),
    ]);
    for (const result of [members, matches, ledger, inventory]) {
      if (result.error) throw result.error;
    }

    /*
     * 문구 표는 없을 수도 있다. 표를 만들려면 db push 가 필요한데, 문구 하나 적자고
     * 터미널을 열게 하면 아무도 안 쓴다. 없으면 기기에 담아 두고 그대로 쓴다.
     * 표가 생기면 기기에 있던 것을 한 번 옮기고, 그때부터 DB 만 본다.
     */
    let templateRows: MessageTemplate[];
    if (templates.error) {
      if (!isMissingTable(templates.error)) throw templates.error;
      this.templatesOnDevice = true;
      templateRows = await readDeviceTemplates(teamRow.id);
    } else {
      this.templatesOnDevice = false;
      templateRows = (templates.data ?? []).map(fromTemplateRow);
      const stranded = await drainDeviceTemplates(teamRow.id);
      for (const row of stranded) {
        await this.saveTemplate(row).catch(() => {});
        templateRows = [...templateRows.filter((item) => item.id !== row.id), row];
      }
    }

    const matchIds = (matches.data ?? []).map((row: { id: string }) => row.id);
    // 경기가 하나도 없으면 in() 호출을 건너뛴다(빈 배열 in은 불필요한 왕복이다).
    const empty = { data: [] as Row[], error: null };
    const [attendance, events, lineups, potmVotes] = matchIds.length
      ? await Promise.all([
          this.client.from('attendance').select('*').in('match_id', matchIds),
          this.client.from('match_events').select('*').in('match_id', matchIds),
          this.client.from('lineups').select('*').in('match_id', matchIds),
          this.client.from('potm_votes').select('*').in('match_id', matchIds),
        ])
      : [empty, empty, empty, empty];
    for (const result of [attendance, events, lineups, potmVotes]) {
      if (result.error) throw result.error;
    }

    const memberRows = (members.data ?? []).map(fromMemberRow);
    await this.attachPhotoUrls(memberRows);

    return {
      team: {
        id: teamRow.id,
        name: teamRow.name,
        monthlyDue: teamRow.monthly_due,
        annualDue: teamRow.annual_due ?? teamRow.monthly_due * 12,
        inviteCode: teamRow.invite_code,
        reminderEnabled: teamRow.reminder_enabled ?? true,
        rules: teamRow.rules ?? null,
      },
      members: memberRows,
      matches: (matches.data ?? []).map(fromMatchRow),
      attendance: (attendance.data ?? []).map(fromAttendanceRow),
      ledger: await this.attachReceiptUrls((ledger.data ?? []).map(fromLedgerRow)),
      events: (events.data ?? []).map(fromEventRow),
      lineups: (lineups.data ?? []).map(fromLineupRow),
      potmVotes: (potmVotes.data ?? []).map(fromPotmRow),
      inventory: (inventory.data ?? []).map(fromInventoryRow),
      templates: templateRows,
    };
  }

  /** 영수증도 비공개 버킷이라 경로만으로는 못 그린다. 회원 사진과 같은 방식이다. */
  private async attachReceiptUrls(rows: Ledger[]): Promise<Ledger[]> {
    const paths = rows.map((row) => row.photoPath).filter(Boolean) as string[];
    if (!paths.length) return rows;

    const { data, error } = await this.client.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (error || !data) return rows;

    const byPath = new Map(data.map((row) => [row.path, row.signedUrl]));
    for (const row of rows) {
      if (row.photoPath) row.photoUri = byPath.get(row.photoPath) ?? null;
    }
    return rows;
  }

  /**
   * 버킷이 비공개라 경로만으로는 그릴 수 없다. 한 번에 모아서 서명 URL 로 바꾼다.
   * 실패해도 앱 전체를 막지 않고 사진만 비운다.
   */
  private async attachPhotoUrls(members: Member[]): Promise<void> {
    const paths = members.map((member) => member.photoPath).filter(Boolean) as string[];
    if (!paths.length) return;

    const { data, error } = await this.client.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (error || !data) return;

    const byPath = new Map(data.map((row) => [row.path, row.signedUrl]));
    for (const member of members) {
      if (member.photoPath) member.photoUri = byPath.get(member.photoPath) ?? null;
    }
  }

  async saveMemberPhoto(member: Member, photo: PickedPhoto) {
    const teamId = this.assertLoaded();
    // 회원당 한 장만 둔다. 같은 경로에 덮어써서 지난 사진이 쌓이지 않게 한다.
    const path = `${teamId}/${member.id}.jpg`;

    const { error } = await this.client.storage
      .from(PHOTO_BUCKET)
      .upload(path, base64ToBytes(photo.base64), {
        contentType: photo.mediaType,
        upsert: true,
      });
    if (error) throw error;

    const { data } = await this.client.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    return { photoUri: data?.signedUrl ?? '', photoPath: path };
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
      this.client
        .from('teams')
        .update({
          name: team.name,
          monthly_due: team.monthlyDue,
          annual_due: team.annualDue,
          reminder_enabled: team.reminderEnabled,
          rules: team.rules,
        })
        .eq('id', team.id),
    );

  /**
   * 회원 저장.
   *
   * `aliases` 는 나중에 더한 칸이라, 스키마를 아직 안 올린 DB 에는 없다. 그대로 보내면
   * Postgres 가 요청을 통째로 거절해서 **이름·메모·등번호까지 하나도 안 저장된다.**
   * 아직 없으면 그 칸만 빼고 다시 보낸다 — 별명만 못 담을 뿐 나머지는 저장된다.
   *
   * 대비책으로 넘어가는 건 "그런 칸 없다"일 때뿐이다. 권한 오류나 네트워크 오류까지
   * 흘리면 진짜 문제가 조용히 묻힌다.
   */
  async saveMember(member: Member): Promise<void> {
    const row = {
      id: member.id,
      team_id: this.assertLoaded(),
      name: member.name,
      nickname: member.nickname,
      role: member.role,
      back_number: member.backNumber,
      // 단수 칸은 옛 앱을 위해 첫 자리를 그대로 채워 둔다.
      preferred_position: member.positions[0] ?? null,
      positions: member.positions,
      age_band: member.ageBand,
      strengths: member.strengths,
      note: member.note,
      photo_url: member.photoPath,
      joined_on: member.joinedOn,
      active: member.active,
    };

    const { error } = await this.client.from('members').upsert({ ...row, aliases: member.aliases });
    if (!error) return;
    if (!isMissingColumn(error, 'aliases')) throw error;

    await this.run(this.client.from('members').upsert(row));
  }

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
        share_token: match.shareToken,
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


  removeAttendance = (matchId: string, memberIds: string[]) =>
    this.run(
      this.client.from('attendance').delete().eq('match_id', matchId).in('member_id', memberIds),
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
          months: row.months,
          occurred_on: row.occurredOn,
          memo: row.memo,
          photo_path: row.photoPath,
          source: row.source,
        })),
      ),
    );

  async saveLedgerPhoto(entry: Ledger, photo: PickedPhoto) {
    const teamId = this.assertLoaded();
    // 장부 한 줄에 한 장. 같은 경로에 덮어써서 지난 사진이 쌓이지 않게 한다.
    const path = `${teamId}/${entry.id}.jpg`;

    const { error } = await this.client.storage
      .from(RECEIPT_BUCKET)
      .upload(path, base64ToBytes(photo.base64), {
        contentType: photo.mediaType,
        upsert: true,
      });
    if (error) throw error;

    const { data } = await this.client.storage.from(RECEIPT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    return { photoUri: data?.signedUrl ?? '', photoPath: path };
  }

  saveInventory = (item: InventoryItem) =>
    this.run(
      this.client.from('inventory').upsert({
        id: item.id,
        team_id: this.assertLoaded(),
        name: item.name,
        quantity: item.quantity,
        note: item.note,
        updated_at: new Date().toISOString(),
      }),
    );

  removeInventory = (id: string) => this.run(this.client.from('inventory').delete().eq('id', id));

  /** 문구 표가 없는 팀에서는 기기에 담는다. load() 가 정해 준다. */
  private templatesOnDevice = false;

  /** 이 팀의 문구가 지금 기기에만 있는지. 화면이 그 사실을 알린다. */
  get templatesAreLocal(): boolean {
    return this.templatesOnDevice;
  }

  async saveTemplate(template: MessageTemplate) {
    const teamId = this.assertLoaded();
    if (this.templatesOnDevice) {
      await saveDeviceTemplate({ ...template, teamId });
      return;
    }
    const { error } = await this.client.from('message_templates').upsert({
      id: template.id,
      team_id: teamId,
      title: template.title,
      body: template.body,
      kind: template.kind,
      used_at: template.usedAt,
    });
    if (!error) return;
    // 표가 없어진 경우까지 오류로 올리면 문구를 못 적는다. 기기로 내려가서 담는다.
    if (!isMissingTable(error)) throw error;
    this.templatesOnDevice = true;
    await saveDeviceTemplate({ ...template, teamId });
  }

  async removeTemplate(id: string) {
    const teamId = this.assertLoaded();
    if (this.templatesOnDevice) {
      await removeDeviceTemplate(teamId, id);
      return;
    }
    const { error } = await this.client.from('message_templates').delete().eq('id', id);
    if (!error) return;
    if (!isMissingTable(error)) throw error;
    this.templatesOnDevice = true;
    await removeDeviceTemplate(teamId, id);
  }

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
          quarter: lineup.quarter,
          side: lineup.side,
          formation_id: lineup.formationId,
          slots: lineup.slots,
          photo_path: lineup.photoPath,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'match_id,quarter,side' },
      ),
    );

  removeLineup = (id: string) => this.run(this.client.from('lineups').delete().eq('id', id));

  async saveLineupPhoto(lineup: Lineup, photo: PickedPhoto) {
    const teamId = this.assertLoaded();
    // (경기, 쿼터) 하나에 한 장. 두 팀이 한 장에 그려져 있어서 팀별로 나누지 않는다.
    const path = `${teamId}/${lineup.matchId}-${lineup.quarter}.jpg`;

    const { error } = await this.client.storage
      .from(LINEUP_BUCKET)
      .upload(path, base64ToBytes(photo.base64), {
        contentType: photo.mediaType,
        upsert: true,
      });
    if (error) throw error;

    const { data } = await this.client.storage.from(LINEUP_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    return { photoUri: data?.signedUrl ?? '', photoPath: path };
  }

  setPotmVote = async (matchId: string, ballot: string, vote: PotmVote | null) => {
    await this.run(
      this.client.from('potm_votes').delete().eq('match_id', matchId).eq('ballot', ballot),
    );
    if (!vote) return;
    await this.run(
      this.client.from('potm_votes').insert({
        id: vote.id,
        match_id: vote.matchId,
        member_id: vote.memberId,
        ballot: vote.ballot,
      }),
    );
  };
}

const PHOTO_BUCKET = 'member-photos';
const LINEUP_BUCKET = 'lineup-photos';
const RECEIPT_BUCKET = 'receipt-photos';
/** 한 시간. 앱을 다시 열면 새로 서명한다. */
const SIGNED_URL_TTL = 60 * 60;

/** RN 에는 Buffer 가 없고 atob 는 바이너리 문자열만 준다. 업로드용 바이트 배열로 직접 바꾼다. */
/**
 * "그런 칸이 없다"인지 가린다.
 *
 * PostgREST 는 스키마 캐시에 없는 칸을 PGRST204 로 돌려주고, Postgres 는 42703 을 준다.
 * 둘 다 보고, 칸 이름까지 맞을 때만 대비책으로 넘어간다.
 */
function isMissingColumn(error: unknown, column: string): boolean {
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message ?? '';
  if (code !== 'PGRST204' && code !== '42703') return false;
  return message.includes(column);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ------------------------------------------------------------ row -> 도메인

type Row = Record<string, any>;

const fromMemberRow = (row: Row): Member => ({
  id: row.id,
  teamId: row.team_id,
  name: row.name,
  nickname: row.nickname,
  aliases: row.aliases ?? [],
  role: row.role,
  backNumber: row.back_number,
  // 예전 행에는 배열이 없고 단수 칸만 있다. 있으면 그걸 첫 칸으로 본다.
  positions: row.positions?.length ? row.positions : row.preferred_position ? [row.preferred_position] : [],
  ageBand: row.age_band ?? null,
  strengths: row.strengths ?? [],
  note: row.note,
  photoUri: null,
  photoPath: row.photo_url,
  joinedOn: row.joined_on,
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
  shareToken: row.share_token ?? null,
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
  months: row.months ?? 1,
  occurredOn: row.occurred_on,
  memo: row.memo,
  photoUri: null,
  photoPath: row.photo_path ?? null,
  source: row.source,
});

const fromTemplateRow = (row: Row): MessageTemplate => ({
  id: row.id,
  teamId: row.team_id,
  title: row.title,
  body: row.body,
  kind: row.kind,
  usedAt: row.used_at ?? null,
});

const fromInventoryRow = (row: Row): InventoryItem => ({
  id: row.id,
  teamId: row.team_id,
  name: row.name,
  quantity: row.quantity,
  note: row.note ?? null,
});

const fromEventRow = (row: Row): MatchEvent => ({
  id: row.id,
  matchId: row.match_id,
  memberId: row.member_id,
  type: row.type,
  minute: row.minute,
});

const fromPotmRow = (row: Row): PotmVote => ({
  id: row.id,
  matchId: row.match_id,
  memberId: row.member_id,
  ballot: row.ballot,
});

const fromLineupRow = (row: Row): Lineup => ({
  id: row.id,
  matchId: row.match_id,
  quarter: row.quarter ?? 1,
  side: row.side ?? 'A',
  formationId: row.formation_id,
  slots: row.slots ?? [],
  photoUri: null,
  photoPath: row.photo_path ?? null,
});
