-- Herstel na bug in agent (select (xyb.pak_volgende_mail()).* riep de functie per kolom aan,
-- waardoor één aanroep alle 17 mails claimde en kolommen van verschillende mails mengde).
-- Agent gerepareerd (select * from xyb.pak_volgende_mail()). Wachtrij terug naar 'nieuw'; run 10 ongeldig gemarkeerd.
update xyb.agent_runs set status = 'fout', fout = 'Ongeldig: kolommen van verschillende mails gemengd (bug pak_volgende_mail, hersteld 18-11)'
 where run_id = 10;
update xyb.mail_wachtrij
   set status = 'nieuw', pogingen = 0, run_id = null, verwerkt_op = null, laatste_fout = null, volgende_poging_op = null,
       proces = case when mailbox = 'nikki@x-yachts.nl' then 'onderdelen'
                     when lower(coalesce(van,'')) ~ '(yachtworld|boatwizard)' then 'yachtworld'
                     else 'overig' end
 where status in ('bezig', 'klaar') and ontvangen_op is not null and mail_id <= 17;
