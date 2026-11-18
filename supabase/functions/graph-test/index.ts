// Test van de Entra-app "X-Yachts automatisering". Leest alleen, wijzigt niets.
// Controleert: 1) token en rechten (Mail.Send mag er NIET in staan),
// 2) toegang per mailbox uit xyb.mailboxen (plus optioneel een controlemailbox die geweigerd moet worden),
// 3) SharePoint-site DocumentenX-YachtsHolland: site-ID en leestoegang.
// Aanroep: POST {"host":"<tenant>.sharepoint.com","controle":"iemand@domein.nl"} (beide optioneel).
// Geeft nooit sleutels of tokens terug.
import postgres from 'npm:postgres@3.4.4';
import { graph, graphToken, graphIngesteld } from './graph.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });
const SITE = 'DocumentenX-YachtsHolland';

function rollen(token: string): string[] {
  const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const j = JSON.parse(atob(p + '='.repeat((4 - p.length % 4) % 4)));
  return (j.roles ?? []).sort();
}

async function probeer(pad: string) {
  try { const r = await graph(pad); return { ok: true, r }; }
  catch (e) { return { ok: false, fout: String((e as Error).message).slice(0, 200) }; }
}

Deno.serve(async (req) => {
  const invoer = await req.json().catch(() => ({}));
  const uit: Record<string, unknown> = { tijd: new Date().toISOString() };
  if (!graphIngesteld()) return Response.json({ ...uit, fout: 'ENTRA_* secrets ontbreken' }, { status: 500 });

  // 1. Token en rechten
  let token: string;
  try { token = await graphToken(); } catch (e) { return Response.json({ ...uit, token: 'MISLUKT', fout: String(e) }, { status: 500 }); }
  const r = rollen(token);
  uit.rechten = r;
  uit.rechten_oordeel = r.some((x) => /^Mail\.Send/i.test(x)) ? 'FOUT: Mail.Send aanwezig' :
    r.some((x) => /^Mail\.ReadWrite$/.test(x)) ? 'goed' : 'let op: Mail.ReadWrite ontbreekt';
  uit.ruime_rechten = r.filter((x) => /\.All$/.test(x));

  // 2. Mailboxen
  const boxen = await sql`select mailbox, actief from xyb.mailboxen order by mailbox`;
  const mb: Record<string, unknown> = {};
  for (const b of boxen) {
    const t = await probeer(`/users/${encodeURIComponent(b.mailbox)}/mailFolders/inbox?$select=totalItemCount,unreadItemCount`);
    mb[b.mailbox] = t.ok ? { toegang: true, actief: b.actief, items: t.r.totalItemCount } : { toegang: false, actief: b.actief, fout: t.fout };
  }
  uit.mailboxen = mb;
  if (invoer.controle) {
    const t = await probeer(`/users/${encodeURIComponent(invoer.controle)}/mailFolders/inbox?$select=totalItemCount`);
    uit.controlemailbox = { mailbox: invoer.controle, oordeel: t.ok ? 'FOUT: toegang buiten de groep' : 'goed: geweigerd', fout: t.ok ? undefined : t.fout };
  }

  // 3. SharePoint
  const sp: Record<string, unknown> = { secret_ingesteld: !!Deno.env.get('SHAREPOINT_SITE_ID') };
  let host = invoer.host as string | undefined;
  if (!host) { const t = await probeer('/sites/root?$select=siteCollection'); host = t.ok ? t.r.siteCollection?.hostname : undefined; }
  if (host) {
    const t = await probeer(`/sites/${host}:/sites/${SITE}?$select=id,displayName,webUrl`);
    if (t.ok) {
      sp.site_id = t.r.id; sp.naam = t.r.displayName; sp.url = t.r.webUrl;
      const d = await probeer(`/sites/${t.r.id}/drive/root/children?$top=5&$select=name`);
      sp.lezen = d.ok ? (d.r.value ?? []).map((x: any) => x.name) : d.fout;
    } else sp.fout = t.fout;
  } else sp.fout = 'host onbekend: geef {"host":"<tenant>.sharepoint.com"} mee';
  uit.sharepoint = sp;

  return Response.json(uit);
});
