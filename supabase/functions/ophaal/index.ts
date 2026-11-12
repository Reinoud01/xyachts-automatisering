// Botenhulp — ophaler (Supabase Edge Function)
// Contract: haalt één bron op, schrijft ruwe rijen in `binnenkomst` + telling in `bron_rondes`,
// roept `verwerk_ronde()` aan en logt in `agent_runs`. Verder raakt hij niets aan.
// Aanroep: POST /functions/v1/ophaal  {"bron":"x-yachts.com"}   (pg_cron)
// Proefrun zonder schrijven: {"bron":"devalk.nl","proef":true} → geeft de rijen terug.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { BRONNEN, type Rij } from './bronnen.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function koersenBijwerken() {
  try {
    const xml = await (await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')).text();
    const rijen = [...xml.matchAll(/currency='([A-Z]{3})' rate='([0-9.]+)'/g)]
      .map(([, valuta, rate]) => ({ valuta, eur_per_eenheid: +(1 / Number(rate)).toFixed(6), bijgewerkt_op: new Date().toISOString().slice(0, 10), bron: 'ECB' }));
    if (rijen.length) await db.from('wisselkoersen').upsert(rijen);
    return rijen.length;
  } catch { return 0; }
}

Deno.serve(async (req) => {
  const { bron, proef } = await req.json().catch(() => ({ bron: null, proef: false }));
  const def = BRONNEN[bron as string];
  if (!def) return new Response(JSON.stringify({ fout: `onbekende bron ${bron}`, bronnen: Object.keys(BRONNEN) }), { status: 400 });

  if (proef) {
    try {
      const { rijen, getoond } = await def.ophalen();
      return new Response(JSON.stringify({ bron, getoond, aantal: rijen.length, rijen }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ fout: e instanceof Error ? e.message : String(e) }), { status: 500 });
    }
  }

  const { data: run } = await db.from('agent_runs').insert({ agent_id: 'aanbod-ophaler', status: 'bezig', tellingen: { bron } }).select().single();
  try {
    const koersen = await koersenBijwerken();
    const { rijen, getoond } = await def.ophalen();
    const { data: ronde, error: e1 } = await db.from('rondes').insert({ type: 'dagelijks', opmerking: `ophaler ${bron}` }).select().single();
    if (e1) throw e1;

    const uniek = new Map<string, Rij>();
    for (const r of rijen) uniek.set(r.url, r);
    const lijst = [...uniek.values()];
    for (let i = 0; i < lijst.length; i += 200) {
      const { error } = await db.from('binnenkomst').insert(lijst.slice(i, i + 200).map((r) => ({ ...r, ronde_id: ronde.ronde_id, bron_id: bron })));
      if (error) throw error;
    }
    // Volledig = we vonden minstens 98% van wat de site zelf zegt te hebben (en niet 0).
    const telbaar = def.telbaar ? lijst.filter(def.telbaar).length : lijst.length;
    const volledig = telbaar > 0 && (getoond == null || telbaar >= Math.floor(getoond * 0.98));
    await db.from('bron_rondes').insert({ ronde_id: ronde.ronde_id, bron_id: bron, getoond_totaal: getoond, gevonden: telbaar,
      status: volledig ? 'volledig' : (telbaar === 0 ? 'niet_bereikt' : 'onvolledig'), opmerking: `${lijst.length} rijen incl. verkocht` });

    const { data: resultaat, error: e2 } = await db.rpc('verwerk_ronde', { r: ronde.ronde_id });
    if (e2) throw e2;
    const tellingen = { bron, ronde_id: ronde.ronde_id, getoond, gevonden: telbaar, volledig, koersen, ...resultaat };
    await db.from('agent_runs').update({ status: volledig ? 'ok' : 'deels', klaar_op: new Date().toISOString(), ronde_id: ronde.ronde_id, tellingen }).eq('run_id', run.run_id);
    return new Response(JSON.stringify(tellingen), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const fout = e instanceof Error ? e.message : JSON.stringify(e);
    await db.from('agent_runs').update({ status: 'fout', klaar_op: new Date().toISOString(), fout }).eq('run_id', run?.run_id);
    return new Response(JSON.stringify({ fout }), { status: 500 });
  }
});
