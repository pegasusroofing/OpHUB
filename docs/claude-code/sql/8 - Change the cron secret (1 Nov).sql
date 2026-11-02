-- Change the cron secret. Run this once, when you're ready, then do step 3 straight away.
-- It contains no secret: it makes a new random one itself.
--
-- 1. Pick a quiet moment, just after a quarter hour (say 7:16pm). Two jobs run every 15 minutes.
-- 2. Paste this whole file into Supabase > SQL Editor and press Run. The result is one row: new_secret.
-- 3. Copy that value. Go to Edge Functions > Secrets, edit CRON_SECRET, paste it over the old one and save.
--    Don't save it anywhere else, and don't paste it into a chat.
-- 4. Tell Claude "cron done". Claude checks the scheduled jobs are getting through.
--
-- Between steps 2 and 3 the scheduled jobs and message emails are refused, so don't leave a gap.
-- If you lose the value, run only the last SELECT below again: it reads it back.
-- If anything doesn't match, the whole thing stops and nothing changes.

do $$
declare
  new_secret text := encode(extensions.gen_random_bytes(32), 'hex');
  pat constant text := '("x-cron-secret":")[^"]+(")';
  fn text := pg_get_functiondef('public.notify_message_push()'::regprocedure);
  j record;
  n int := 0;
begin
  if (select count(*) from cron.job where command ~ pat) <> 15 then
    raise exception 'Expected 15 scheduled jobs with the secret. Nothing changed. Ask Claude.';
  end if;
  if fn !~ pat then
    raise exception 'The message email trigger has no secret where expected. Nothing changed. Ask Claude.';
  end if;

  for j in select jobid, command from cron.job where command ~ pat loop
    perform cron.alter_job(job_id := j.jobid, command := regexp_replace(j.command, pat, '\1' || new_secret || '\2', 'g'));
    n := n + 1;
  end loop;

  execute regexp_replace(fn, pat, '\1' || new_secret || '\2', 'g');

  if n <> 15 then
    raise exception 'Only % jobs changed. Nothing changed. Ask Claude.', n;
  end if;
end $$;

select substring(command from '"x-cron-secret":"([^"]+)"') as new_secret from cron.job limit 1;
