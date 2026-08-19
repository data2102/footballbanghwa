/**
 * send-reminders — 경기 전날, 아직 답을 안 한 사람에게 알림을 보낸다.
 *
 * "누구에게 보낼지"는 DB 의 pending_reminders() 가 정한다. 여기서는 받아서 보내기만 한다.
 * 서비스 키로만 부를 수 있고(RLS 를 넘어 모든 팀을 훑어야 한다), 한 경기에 한 번만 보낸다.
 *
 * 배포:   supabase functions deploy send-reminders --no-verify-jwt
 * 스케줄: supabase/migrations 의 안내 참고 (pg_cron 또는 외부 스케줄러)
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

/** Expo 푸시 게이트웨이. 한 번에 100건까지 받는다. */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

type Reminder = {
  match_id: string;
  team_name: string;
  match_date: string;
  kickoff: string;
  venue: string;
  member_id: string;
  member_name: string;
  push_token: string;
  platform: string;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: { matchId: string; screen: 'attendance' };
};

/** '2026-08-23' -> '8월 23일 (일)' */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

function toMessage(row: Reminder): ExpoMessage {
  const time = row.kickoff.slice(0, 5);
  return {
    to: row.push_token,
    title: `${row.team_name} · ${formatDate(row.match_date)} 경기`,
    // 알림은 한 줄로 읽고 끝나야 한다. 언제·어디서와 무엇을 해야 하는지만 남긴다.
    body: `${time} ${row.venue}. 아직 참석 여부를 안 남기셨어요.`,
    sound: 'default',
    data: { matchId: row.match_id, screen: 'attendance' },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다.' }, 500);
  }

  const client = createClient(url, serviceKey);

  // 기본 24시간. 하루 두 번 돌린다면 12로 줄여도 결과는 같다(보낸 경기는 제외되므로).
  const withinHours = Number(new URL(req.url).searchParams.get('hours') ?? '24');

  const { data, error } = await client.rpc('pending_reminders', { p_within_hours: withinHours });
  if (error) {
    console.error('pending_reminders failed', error);
    return json({ error: error.message }, 500);
  }

  const rows = (data ?? []) as Reminder[];
  if (rows.length === 0) return json({ sent: 0, matches: 0, note: '보낼 대상이 없습니다.' });

  const messages = rows.map(toMessage);
  const results: { ok: number; failed: number; errors: string[] } = { ok: 0, failed: 0, errors: [] };
  // 한 번이라도 전송에 성공한 경기만 "보냄"으로 표시한다.
  const deliveredMatches = new Set<string>();

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const slice = rows.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        body: JSON.stringify(batch),
      });
      const payload = (await response.json()) as { data?: { status: string; message?: string }[] };

      payload.data?.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          results.ok += 1;
          deliveredMatches.add(slice[index].match_id);
        } else {
          results.failed += 1;
          if (ticket.message) results.errors.push(ticket.message);
          // 기기를 지웠거나 앱을 삭제한 토큰은 계속 실패한다. 지워서 다음부터 건너뛴다.
          if (ticket.message?.includes('DeviceNotRegistered')) {
            client.from('push_tokens').delete().eq('token', slice[index].push_token);
          }
        }
      });
    } catch (caught) {
      results.failed += batch.length;
      results.errors.push(caught instanceof Error ? caught.message : String(caught));
    }
  }

  if (deliveredMatches.size > 0) {
    const { error: markError } = await client.rpc('mark_reminders_sent', {
      p_match_ids: [...deliveredMatches],
    });
    // 표시에 실패해도 발송은 끝났다. 다음 회차에 중복이 갈 수 있으니 로그로 남긴다.
    if (markError) console.error('mark_reminders_sent failed', markError);
  }

  return json({
    sent: results.ok,
    failed: results.failed,
    matches: deliveredMatches.size,
    errors: results.errors.slice(0, 5),
  });
});
