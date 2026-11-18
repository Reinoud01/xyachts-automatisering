// Werkbord-API voor de X-Agent-site (GitHub Pages).
// Eigen authenticatie: het Supabase Auth-token van de ingelogde gebruiker wordt gecontroleerd,
// daarna bepaalt public.dealer_gebruikers bij welke dealer (= schema) het mailadres hoort.
// Alleen dat schema wordt gelezen en beschreven. Aanbod komt uit de centrale botendatabase (public).
// Nooit mail versturen, niets verwijderen.
// Aanroep: GET  → { gebruiker, onderdelen[], occasions[], aanbod }
//          POST { soort: 'onderdelen' | 'occasions', rec: {...} } → opslaan (nieuw of bijwerken)
// Secrets (automatisch): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_DB_URL. Optioneel: WERKBORD_ORIGINS.
import postgres from 'npm:postgres@3.4.4';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const SUPA = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const ORIGINS = (Deno.env.get('WERKBORD_ORIGINS') ?? 'https://reinoud01.github.io,http://localhost:8000')
  .split(',').map((s) => s.trim()).filter(Boolean);

const OND_STATUS = ['nieuw', 'info nodig', 'bij leverancier', 'offerte naar klant', 'besteld', 'geleverd', 'niet leverbaar', 'geannuleerd', 'vervallen'];
const KANALEN = ['email', 'formulier', 'telefoon', 'balie', 'anders'];
const OCC_STATUS = ['nieuw', 'vraag beantwoord', 'bezichtiging', 'in onderhandeling', 'verkocht', 'afgehaakt'];

function corsHeaders(req: Request): Record<string, string> {
  const o = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

async function gebruiker(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${SUPA}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON } });
  if (!r.ok) return null;
  const u = await r.json();
  const email = String(u.email ?? '').toLowerCase();
  if (!email) return null;
  const [g] = await sql`
    select g.email, g.naam, g.rol, d.dealer_id, d.naam as dealer_naam, d.taal
      from public.dealer_gebruikers g join public.dealers d using (dealer_id)
     where g.email = ${email} and g.actief and d.actief`;
  return g ?? { email, onbekend: true };
}

const t = (schema: string, tabel: string) => sql(`${schema}.${tabel}`);
const tekst = (v: unknown, max = 4000) => (v === undefined || v === null || String(v).trim() === '') ? null : String(v).trim().slice(0, max);
const getal = (v: unknown) => (v === undefined || v === null || v === '' || isNaN(Number(v))) ? null : Number(v);
const datum = (v: unknown) => { const s = tekst(v, 40); return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const id = (v: unknown) => { const s = tekst(v, 80); return s && /^[A-Za-z0-9_-]+$/.test(s) ? s : crypto.randomUUID(); };

async function lees(schema: string) {
  const [onderdelen, occasions, boten, bron] = await Promise.all([
    sql`select aanvraag_id as id, datum::text, klant_naam as klant, klant_email as email, boottype, bouwnummer,
               omschrijving as onderdeel, leverancier_tekst as leverancier, prijs_inkoop::float8 as inkoop,
               prijs_verkoop::float8 as verkoop, levertijd, coalesce(status, 'nieuw') as status, status_sinds::text,
               notitie, bijgewerkt_op as bijgewerkt, kanaal, mailbox
          from ${t(schema, 'onderdeel_aanvragen')} order by datum desc nulls last limit 3000`,
    sql`select lead_id as id, datum::text, naam, email, telefoon, boot, vraag, coalesce(status, 'nieuw') as status,
               status_voorstel, volgende_stap, laatste_opvolging::text, notitie, bijgewerkt_op as bijgewerkt, bron, mailbox
          from ${t(schema, 'occasion_leads')} order by datum desc nulls last limit 3000`,
    sql`select a.model, a.bouwjaar as jaar, a.prijs_eur::float8 as eur, a.vraagprijs::float8 as prijs, a.valuta as val,
               a.land, a.ligplaats as plaats, a.verkoper, a.prioriteit as prio, a.eerst_gezien::text as sinds,
               (a.eerst_gezien >= current_date - 14) as nieuw, a.status, a.url, a.bron, a.aantal_advertenties::int as advertenties,
               d.daling
          from public.actueel_aanbod a
          left join lateral (
            select jsonb_build_object('oud', (g.oud->>'prijs_eur')::numeric, 'pct', (g.nieuw->>'procent')::numeric,
                                      'datum', g.aangemaakt_op::date) as daling
              from public.gebeurtenissen g
             where g.boot_id = a.boot_id and g.soort = 'prijsdaling' and g.aangemaakt_op > now() - interval '60 days'
             order by g.aangemaakt_op desc limit 1) d on true`,
    sql`select max(laatst_gezien)::text as bijgewerkt, count(distinct bron)::int as bronnen from public.actueel_aanbod`,
  ]);
  return { onderdelen, occasions, aanbod: { bijgewerkt: bron[0]?.bijgewerkt ?? null, bronnen: bron[0]?.bronnen ?? 0, boten } };
}

async function opslaan(schema: string, door: string, soort: string, r: any) {
  if (soort === 'onderdelen') {
    const status = OND_STATUS.includes(r.status) ? r.status : 'nieuw';
    const v = {
      aanvraag_id: id(r.id), datum: datum(r.datum) ?? new Date().toISOString().slice(0, 10),
      klant_naam: tekst(r.klant, 200), klant_email: tekst(r.email, 200), boottype: tekst(r.boottype, 100),
      bouwnummer: tekst(r.bouwnummer, 40), omschrijving: tekst(r.onderdeel), leverancier_tekst: tekst(r.leverancier, 200),
      prijs_inkoop: getal(r.inkoop), prijs_verkoop: getal(r.verkoop), levertijd: tekst(r.levertijd, 100), status,
      notitie: tekst(r.notitie), kanaal: KANALEN.includes(r.kanaal) ? r.kanaal : 'anders',
    };
    const [oud] = await sql`select status from ${t(schema, 'onderdeel_aanvragen')} where aanvraag_id = ${v.aanvraag_id}`;
    await sql`
      insert into ${t(schema, 'onderdeel_aanvragen')} ${sql({ ...v, status_sinds: new Date().toISOString().slice(0, 10), bijgewerkt_op: new Date() })}
      on conflict (aanvraag_id) do update set
        datum = excluded.datum, klant_naam = excluded.klant_naam, klant_email = excluded.klant_email,
        boottype = excluded.boottype, bouwnummer = excluded.bouwnummer, omschrijving = excluded.omschrijving,
        leverancier_tekst = excluded.leverancier_tekst, prijs_inkoop = excluded.prijs_inkoop, prijs_verkoop = excluded.prijs_verkoop,
        levertijd = excluded.levertijd, notitie = excluded.notitie, bijgewerkt_op = now(),
        status_sinds = case when ${t(schema, 'onderdeel_aanvragen')}.status is distinct from excluded.status then current_date
                            else ${t(schema, 'onderdeel_aanvragen')}.status_sinds end,
        status = excluded.status`;
    await sql`insert into ${t(schema, 'gebeurtenissen')} (onderwerp, onderwerp_id, soort, tekst, door)
              values ('onderdeel', ${v.aanvraag_id}, ${oud ? 'bijgewerkt' : 'aangemaakt'},
                      ${oud && oud.status !== status ? `Status ${oud.status} → ${status}` : 'Via werkbord'}, ${door})`;
    return v.aanvraag_id;
  }
  if (soort === 'occasions') {
    const status = OCC_STATUS.includes(r.status) ? r.status : 'nieuw';
    const v = {
      lead_id: id(r.id), datum: datum(r.datum) ?? new Date().toISOString().slice(0, 10),
      naam: tekst(r.naam, 200), email: tekst(r.email, 200), telefoon: tekst(r.telefoon, 60), boot: tekst(r.boot, 100),
      vraag: tekst(r.vraag), volgende_stap: tekst(r.volgende_stap, 300), laatste_opvolging: datum(r.laatste_opvolging),
      status, status_voorstel: r.status_voorstel && typeof r.status_voorstel === 'object' ? r.status_voorstel : null,
      notitie: tekst(r.notitie), bron: tekst(r.bron, 60) ?? 'werkbord',
    };
    const [oud] = await sql`select status from ${t(schema, 'occasion_leads')} where lead_id = ${v.lead_id}`;
    await sql`
      insert into ${t(schema, 'occasion_leads')} ${sql({ ...v, status_voorstel: v.status_voorstel ? JSON.stringify(v.status_voorstel) : null, bijgewerkt_op: new Date() } as any)}
      on conflict (lead_id) do update set
        datum = excluded.datum, naam = excluded.naam, email = excluded.email, telefoon = excluded.telefoon, boot = excluded.boot,
        vraag = excluded.vraag, volgende_stap = excluded.volgende_stap, laatste_opvolging = excluded.laatste_opvolging,
        status = excluded.status, status_voorstel = excluded.status_voorstel, notitie = excluded.notitie, bijgewerkt_op = now()`;
    await sql`insert into ${t(schema, 'gebeurtenissen')} (onderwerp, onderwerp_id, soort, tekst, door)
              values ('occasion', ${v.lead_id}, ${oud ? 'bijgewerkt' : 'aangemaakt'},
                      ${oud && oud.status !== status ? `Status ${oud.status} → ${status}` : 'Via werkbord'}, ${door})`;
    return v.lead_id;
  }
  throw new Error('Onbekende soort');
}

Deno.serve(async (req) => {
  const h = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: h });
  try {
    const g: any = await gebruiker(req);
    if (!g) return json({ fout: 'Niet ingelogd' }, 401);
    if (g.onbekend) return json({ fout: 'Dit mailadres heeft geen toegang tot een werkbord.', email: g.email }, 403);
    const schema = g.dealer_id;
    const wie = { email: g.email, naam: g.naam, rol: g.rol, dealer: g.dealer_naam, taal: g.taal };
    if (req.method === 'GET') return json({ gebruiker: wie, ...(await lees(schema)) });
    if (req.method === 'POST') {
      if (g.rol === 'lezen') return json({ fout: 'Alleen lezen' }, 403);
      const { soort, rec } = await req.json();
      if (!rec || typeof rec !== 'object') return json({ fout: 'Geen gegevens' }, 400);
      return json({ ok: true, id: await opslaan(schema, g.email, soort, rec) });
    }
    return json({ fout: 'Methode niet toegestaan' }, 405);
  } catch (e) {
    console.error(e);
    return json({ fout: 'Er ging iets mis op de server.' }, 500);
  }
});
