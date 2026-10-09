-- Run ONCE in the Supabase SQL Editor after the API route is deployed.
-- 1) Replace <CRON_SECRET> with the same value set as CRON_SECRET in Vercel.
-- 2) Replace the URL if your production domain differs.
-- Rotate the secret later with: select vault.update_secret((select id from vault.secrets where name = 'pulse_cron_secret'), '<new>');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select vault.create_secret('<CRON_SECRET>', 'pulse_cron_secret');

select cron.schedule(
  'pulse-send-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://pulse-app-habit.vercel.app/api/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'pulse_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);

select cron.schedule('pulse-clean-notification-log', '17 3 * * *', $$select public.cleanup_notification_log();$$);

-- Checks:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select id, status_code, content::text from net._http_response order by created desc limit 5;
-- Stop it: select cron.unschedule('pulse-send-notifications');
