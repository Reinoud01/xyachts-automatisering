-- Fase 2 pilot onderdelenmail (18 november): info@ en nikki@ aan, proces onderdelen aan in schaduwmodus,
-- crons voor mail-ophalen (elke 5 min) en agent (elke 2 min, werkdagen 07-19 NL), taken in monitoring aan.
-- De API-sleutel voor de cron-aanroep wordt overgenomen uit de bestaande voys-sync-taak (geen sleutel in Git).
update xyb.mailboxen set actief = true where mailbox in ('info@x-yachts.nl', 'nikki@x-yachts.nl');
update xyb.agent_instellingen set actief = true, schaduw = true where proces = 'onderdelen';
update xyb.taken set actief = true where taak in ('mail-ophalen', 'onderdelen');

do $$
declare k text := (select substring(command from 'Bearer ([A-Za-z0-9._-]+)') from cron.job where jobname = 'voys-sync-kwartier');
begin
  perform cron.schedule('mail-ophalen-5min', '*/5 * * * *', format(
    $c$select net.http_post(url:='https://cqjdqyzsigmsnaffrvmt.supabase.co/functions/v1/mail-ophalen', headers:=jsonb_build_object('Authorization','Bearer %s','Content-Type','application/json'), body:='{}'::jsonb, timeout_milliseconds:=150000)$c$, k));
  perform cron.schedule('agent-2min', '*/2 6-17 * * 1-5', format(
    $c$select net.http_post(url:='https://cqjdqyzsigmsnaffrvmt.supabase.co/functions/v1/agent', headers:=jsonb_build_object('Authorization','Bearer %s','Content-Type','application/json'), body:='{}'::jsonb, timeout_milliseconds:=150000)$c$, k));
end $$;
