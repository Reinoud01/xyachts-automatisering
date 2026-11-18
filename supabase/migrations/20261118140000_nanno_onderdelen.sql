-- Onderdelendraden lopen ook via nanno@; de agent sorteert per mail, dus onderdelen naast occasions toestaan.
update xyb.mailboxen set processen = array['occasions','onderdelen'] where mailbox = 'nanno@x-yachts.nl';
-- Zeegers-mail van 18-11 opnieuw laten verwerken (eerder overgeslagen omdat onderdelen niet bij nanno@ hoorde).
update xyb.mail_wachtrij set status = 'nieuw', pogingen = 0, run_id = null, verwerkt_op = null
 where mailbox = 'nanno@x-yachts.nl' and proces = 'onderdelen' and status = 'handmatig';
