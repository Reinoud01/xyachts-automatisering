-- Fase 3 start (18 november): occasionmail in schaduwmodus naast de huidige taak van Nanno.
-- nanno@ aan; proces occasions aan (info@ had occasions al in zijn processen).
update xyb.mailboxen set actief = true where mailbox = 'nanno@x-yachts.nl';
update xyb.agent_instellingen set actief = true, schaduw = true where proces = 'occasions';
update xyb.taken set actief = true where taak = 'occasions';
