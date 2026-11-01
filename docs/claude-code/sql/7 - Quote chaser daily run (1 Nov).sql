-- DONE 1 Nov 2026: applied at Andy's request. Do not paste again.
-- Quote chaser: the weekday 8am run (UTC) that sends chasers automatically.
-- Paste into Supabase > SQL Editor when you want automatic chasing available.
-- It copies the settings from the calendar reminders job, so the secret isn't written here. If you change the cron
-- secret, this job needs changing along with the others.
-- This alone emails nobody. Chasers only go once you also switch on Home > Quotes > Quote settings > Send chasers
-- automatically, and then only for Returned quotes with the chaser on and a contact email. Imported quotes stay off.
select cron.schedule('quote-chaser-weekdays', '0 8 * * 1-5', replace(command, 'send-calendar-reminders', 'quote-tracker'))
from cron.job where jobname = 'calendar-reminders-daily';
