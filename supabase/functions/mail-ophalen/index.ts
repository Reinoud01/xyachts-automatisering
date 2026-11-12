// Haalt nieuwe mail op uit de actieve mailboxen (xyb.mailboxen) via Graph delta-query
// en zet die in xyb.mail_wachtrij. Verwerkt zelf niets. Aanroep: POST {} (pg_cron, elke 5 minuten).
import postgres from 'npm:postgres@3.4.4';
import { graph, graphIngesteld } from './graph.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });
const VELDEN = 'id,internetMessageId,conversationId,receivedDateTime,from,subject,bodyPreview,categories,isDraft';

function proces(mailbox: string, processen: string[], m: any): string {
  const van = (m.from?.emailAddress?.address ?? '').toLowerCase();
  if (/yachtworld|boatwizard/.test(van) && processen.includes('yachtworld')) return 'yachtworld';
  if (processen.length === 1) return processen[0];
  return 'overig'; // de agent sorteert verder met het kleine model
}

Deno.serve(async () => {
  const [run] = await sql`insert into xyb.agent_runs (taak) values ('mail-ophalen') returning run_id`;
  const tellingen: Record<string, number> = {};
  try {
    if (!graphIngesteld()) throw new Error('Entra-app nog niet ingesteld; niets opgehaald');
    const boxen = await sql`select mailbox, processen, map from xyb.mailboxen where actief`;
    for (const b of boxen) {
      const [d] = await sql`select delta_link from xyb.graph_delta where mailbox = ${b.mailbox}`;
      // Eerste keer: alleen mail van de laatste 2 dagen, daarna alleen wijzigingen.
      let url: string = d?.delta_link ??
        `/users/${encodeURIComponent(b.mailbox)}/mailFolders/${b.map}/messages/delta?$select=${VELDEN}` +
        `&$filter=receivedDateTime ge ${new Date(Date.now() - 2 * 864e5).toISOString()}`;
      let nieuw = 0, deltaLink: string | null = null;
      for (let pagina = 0; pagina < 20 && url; pagina++) {
        const res = await graph(url, { headers: { Prefer: 'odata.maxpagesize=50' } });
        for (const m of res.value ?? []) {
          if (m['@removed'] || m.isDraft) continue;
          if ((m.categories ?? []).some((c: string) => /-verwerkt$/i.test(c))) continue;
          const r = await sql`
            insert into xyb.mail_wachtrij (mailbox, graph_message_id, internet_message_id, conversation_id, ontvangen_op, van, onderwerp, voorbeeld, proces)
            values (${b.mailbox}, ${m.id}, ${m.internetMessageId ?? null}, ${m.conversationId ?? null}, ${m.receivedDateTime ?? null},
                    ${m.from?.emailAddress?.address ?? null}, ${m.subject ?? null}, ${(m.bodyPreview ?? '').slice(0, 300)}, ${proces(b.mailbox, b.processen, m)})
            on conflict (mailbox, graph_message_id) do nothing returning mail_id`;
          nieuw += r.length;
        }
        url = res['@odata.nextLink'] ?? null;
        deltaLink = res['@odata.deltaLink'] ?? deltaLink;
      }
      if (deltaLink) {
        await sql`insert into xyb.graph_delta (mailbox, map, delta_link, laatst_gelopen) values (${b.mailbox}, ${b.map}, ${deltaLink}, now())
                  on conflict (mailbox) do update set delta_link = excluded.delta_link, laatst_gelopen = now()`;
      }
      tellingen[b.mailbox] = nieuw;
    }
    const vrij = await sql`select xyb.vrijgeven_vastgelopen() n`;
    await sql`update xyb.agent_runs set status = 'ok', klaar_op = now(), tellingen = ${sql.json({ ...tellingen, vrijgegeven: vrij[0].n })} where run_id = ${run.run_id}`;
    return Response.json({ ok: true, tellingen });
  } catch (e) {
    const fout = e instanceof Error ? e.message : String(e);
    await sql`update xyb.agent_runs set status = 'fout', klaar_op = now(), fout = ${fout} where run_id = ${run.run_id}`;
    return Response.json({ ok: false, fout }, { status: 500 });
  }
});
