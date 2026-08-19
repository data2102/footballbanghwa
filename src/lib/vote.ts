import { supabase } from '@/lib/supabase';
import { LocalRepo } from '@/lib/repo';
import { uid } from '@/lib/format';
import type { AttendanceStatus } from '@/lib/types';

/**
 * 가입 없이 참석만 받는 경로.
 *
 * 팀원 16명을 전부 회원가입시키는 게 이 앱을 도입할 때 가장 큰 장벽이다.
 * 그래서 이 파일만은 저장소 인터페이스를 거치지 않는다 — Repo 는 "로그인한 팀원"을
 * 전제로 하는데, 여기 오는 사람은 로그인이 없다.
 *
 * 토큰 하나로 열리므로 노출 범위를 경기 하나로 좁힌다. 회비도, 다른 경기도 보이지 않는다.
 */

export type VoteBallot = {
  teamName: string;
  match: { date: string; kickoff: string; venue: string; opponent: string | null };
  members: { id: string; name: string; status: AttendanceStatus }[];
};

/** 링크가 가리키는 경기와 명단. 토큰이 틀리면 null. */
export async function loadBallot(token: string): Promise<VoteBallot | null> {
  if (supabase) {
    const { data, error } = await supabase.rpc('ballot_by_share_token', { p_token: token });
    if (error) throw new Error(readableError(error.message));
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      teamName: row.team_name,
      match: {
        date: row.match_date,
        kickoff: String(row.kickoff).slice(0, 5),
        venue: row.venue,
        opponent: row.opponent,
      },
      members: (row.members ?? []).map((member: { id: string; name: string; status: string }) => ({
        id: member.id,
        name: member.name,
        status: (member.status ?? 'unknown') as AttendanceStatus,
      })),
    };
  }

  // 데모 모드는 서버가 없다. 같은 기기 안에서만 열린다.
  const data = await new LocalRepo().load();
  const match = data.matches.find((row) => row.shareToken === token);
  if (!match) return null;
  return {
    teamName: data.team.name,
    match: {
      date: match.date,
      kickoff: match.kickoff,
      venue: match.venue,
      opponent: match.opponent,
    },
    members: data.members
      .filter((member) => member.active)
      .map((member) => ({
        id: member.id,
        name: member.name,
        status:
          data.attendance.find((row) => row.matchId === match.id && row.memberId === member.id)
            ?.status ?? 'unknown',
      })),
  };
}

export async function submitVote(
  token: string,
  memberId: string,
  status: AttendanceStatus,
): Promise<void> {
  if (supabase) {
    const { error } = await supabase.rpc('vote_by_share_token', {
      p_token: token,
      p_member: memberId,
      p_status: status,
    });
    if (error) throw new Error(readableError(error.message));
    return;
  }

  const local = new LocalRepo();
  const data = await local.load();
  const match = data.matches.find((row) => row.shareToken === token);
  if (!match) throw new Error('링크가 만료됐어요. 총무에게 새 링크를 받아 주세요.');
  const existing = data.attendance.find(
    (row) => row.matchId === match.id && row.memberId === memberId,
  );
  await local.saveAttendance([
    {
      id: existing?.id ?? uid(),
      matchId: match.id,
      memberId,
      status,
      note: existing?.note ?? null,
      source: 'manual',
      updatedAt: new Date().toISOString(),
    },
  ]);
}

/** DB 오류 문자열을 그대로 보여 주지 않는다. 링크를 누른 사람은 총무가 아니다. */
function readableError(raw: string): string {
  if (raw.includes('EXPIRED') || raw.includes('NOT_FOUND')) {
    return '링크가 만료됐어요. 총무에게 새 링크를 받아 주세요.';
  }
  return '지금은 저장이 안 돼요. 잠시 뒤 다시 눌러 주세요.';
}
