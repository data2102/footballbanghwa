-- 경기 전날 알림을 자동으로 보내는 스케줄.
--
-- 마이그레이션이 아니다. 프로젝트 주소와 키가 들어가야 해서 저장소에 값을 넣을 수 없다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 <> 부분을 채워서 한 번 실행한다.
--
-- 먼저 함수를 배포해 둔다:
--   supabase functions deploy send-reminders --no-verify-jwt
--
-- --no-verify-jwt 인 이유: 사용자가 아니라 스케줄러가 부르기 때문이다.
-- 대신 서비스 키를 헤더에 실어 보내고, 함수가 쓰는 pending_reminders() 는
-- service_role 에만 열려 있다.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

/*
 * cron 은 UTC 로 돈다. 한국은 UTC+9 이므로 9를 빼서 적는다.
 *   저녁 8시(KST) -> 11:00 UTC -> '0 11 * * *'
 *   저녁 9시(KST) -> 12:00 UTC -> '0 12 * * *'
 *
 * 하루 한 번이면 충분하다. 여러 번 돌려도 이미 보낸 경기는 제외되므로 중복은 없다.
 */
select cron.schedule(
  'send-match-reminders',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 키를 SQL 에 직접 적는 게 마음에 걸리면 Vault 를 쓴다.
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- 그리고 위 헤더를 이렇게 바꾼다.
--   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')

-- ---------------------------------------------------------------- 확인·해제

-- 등록된 스케줄 보기
--   select jobid, schedule, jobname, active from cron.job;

-- 최근 실행 결과 보기 (실패하면 여기 남는다)
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'send-match-reminders')
--   order by start_time desc limit 10;

-- 끄기
--   select cron.unschedule('send-match-reminders');

-- 스케줄을 기다리지 않고 지금 한 번 보내 보기 (터미널에서)
--   curl -X POST 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders' \
--        -H 'Authorization: Bearer <SERVICE_ROLE_KEY>'
