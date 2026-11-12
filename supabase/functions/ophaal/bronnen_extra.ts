// Extra bronnen voor de cloud-ophaler. Alleen sites waarvan robots.txt dit toestaat en die
// verzoeken met onze eigen naam beantwoorden. Rustig tempo: pauze tussen verzoeken.
import type { Rij } from './bronnen.ts';

export const UA = 'XYachtsBenelux-aanbodronde/1.0 (+https://www.x-yachts.nl)';
const pauze = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function haal(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json' } });
  if (!r.ok) throw new Error(`${new URL(url).host} HTTP ${r.status}`);
  return r.text();
}

export const tekst = (s: string) => s
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&euro;|&#8364;/g, '€').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/&nbsp;/g, ' ')
  .replace(/&#0?39;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();

// Bedrag uit "€ 168.000" / "EUR 199.000,00" / "€ 189.000 Inclusief btw" (Europese notatie)
export function bedragEU(t: string | null | undefined): number | null {
  const m = t?.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?/);
  return m ? Number(m[1].replace(/\./g, '')) || null : null;
}

const LANDEN: Record<string, string> = {
  nederland: 'Netherlands', belgië: 'Belgium', belgie: 'Belgium', duitsland: 'Germany', frankrijk: 'France',
  spanje: 'Spain', italië: 'Italy', italie: 'Italy', kroatië: 'Croatia', kroatie: 'Croatia', griekenland: 'Greece',
  portugal: 'Portugal', denemarken: 'Denmark', zweden: 'Sweden', noorwegen: 'Norway', engeland: 'United Kingdom',
  deutschland: 'Germany', dänemark: 'Denmark', niederlande: 'Netherlands', frankreich: 'France', spanien: 'Spain',
  italien: 'Italy', kroatien: 'Croatia', schweden: 'Sweden', griechenland: 'Greece', österreich: 'Austria', schweiz: 'Switzerland',
};
export const land = (t: string | null | undefined) => {
  if (!t) return null;
  const k = t.toLowerCase();
  for (const [naam, en] of Object.entries(LANDEN)) if (k.includes(naam)) return en;
  return null;
};

// Herken een X-Yachts-model in een titel
export const xModel = (t: string) =>
  t.match(/\b(IMX[\s-]?\d{2}|X[cpr]\s?\d{2}|X\s?\d(?:[.,]\d)?(?:\s?Mk\s?I{1,2})?|X[-\s]?\d{2,3}(?:\s?Mk\s?I{1,2})?(?:\s?Sport)?)\b/i)?.[1] ?? null;

// ---------------- De Valk ----------------
// Merkpagina toont per model een kaart onder "X-yachts modellen te koop"; per model staat op de modelpagina
// "… te koop" en "… verkocht". Per boot te koop één detailpagina voor het kantoor (= land).
const DEVALK_KANTOOR: Record<string, string> = {
  'costa blanca': 'Spain', 'coruña': 'Spain', 'coruna': 'Spain', 'mallorca': 'Spain', 'barcelona': 'Spain', 'ibiza': 'Spain',
  'istri': 'Croatia', 'kroati': 'Croatia', 'antibes': 'France', 'côte': 'France', 'cote': 'France', 'griek': 'Greece', 'turk': 'Turkey',
  'belg': 'Belgium', 'nieuwpoort': 'Belgium', 'duits': 'Germany', 'portugal': 'Portugal', 'lagos': 'Portugal',
};
export async function devalk(): Promise<{ rijen: Rij[]; getoond: number | null }> {
  const basis = 'https://www.devalk.nl';
  const merk = await haal(`${basis}/nl/merk/x%7Cyachts.html`);
  const teKoopBlok = merk.split(/modellen te koop<\/h2>/i)[1]?.split(/<h2>/i)[0] ?? '';
  const modellen = [...new Set([...teKoopBlok.matchAll(/href="(https:\/\/www\.devalk\.nl\/nl\/model\/[^"]+)"/g)].map((m) => m[1]))];
  const rijen: Rij[] = [];
  for (const mUrl of modellen) {
    await pauze(1500);
    const html = await haal(mUrl);
    const blok = html.split(/ te koop<\/h2>/i)[1]?.split(/ verkocht<\/h2>/i)[0] ?? '';
    for (const kaart of blok.split(/<a href="(?=https:\/\/www\.devalk\.nl\/nl\/jachtmakelaardij\/)/).slice(1)) {
      const url = kaart.match(/^(https:\/\/www\.devalk\.nl\/nl\/jachtmakelaardij\/(\d+)\/[^"]+)"/);
      if (!url) continue;
      const t = tekst(kaart);
      const titel = kaart.match(/<h6>([^<]+)<\/h6>/)?.[1]?.trim() ?? '';
      const jaar = Number(t.match(/Bouwjaar\s*(\d{4})/)?.[1]) || null;
      const prijsTekst = t.match(/Vraagprijs\s*([^\n]+)/)?.[1]?.trim() ?? null;
      const status = /onder bod|onder optie/i.test(t) ? 'onder_bod' : 'te_koop';
      await pauze(1500);
      const detail = tekst(await haal(url[1]));
      const kantoor = detail.match(/(?:^|\n)\s*Kantoor\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? null;
      const ligplaats = detail.match(/(?:^|\n)\s*Ligplaats\s*\n\s*([^\n]+)/)?.[1]?.replace(/^contact\s+/i, '').trim() ?? null;
      const ligplaatsSchoon = ligplaats && !/kantoor/i.test(ligplaats) ? ligplaats : null;
      const k = (kantoor ?? '').toLowerCase();
      const landNaam = Object.entries(DEVALK_KANTOOR).find(([s]) => k.includes(s))?.[1] ?? (kantoor ? 'Netherlands' : null);
      rijen.push({
        url: url[1], extern_id: url[2], model_ruw: titel.replace(/^X-Yachts\s+/i, ''), bouwjaar: jaar,
        verkoper: kantoor ?? 'De Valk Yacht Brokers', ligplaats: ligplaatsSchoon, land: landNaam,
        prijs_tekst: prijsTekst, vraagprijs: bedragEU(prijsTekst), valuta: prijsTekst ? 'EUR' : null, btw: null, status,
      });
    }
  }
  return { rijen, getoond: null };
}

// ---------------- Escape Yachting ----------------
// WordPress-API geeft alle boten met status (beschikbaar/verkocht); per X-Yachts-boot één detailpagina.
export async function escape(): Promise<{ rijen: Rij[]; getoond: number | null }> {
  const lijst = JSON.parse(await haal('https://escape-yachting.com/wp-json/wp/v2/tweedehands-boot?per_page=100&_fields=id,link,title,class_list')) as
    { id: number; link: string; title: { rendered: string }; class_list: string[] }[];
  const rijen: Rij[] = [];
  let getoond = 0;
  for (const b of lijst) {
    const titel = tekst(b.title.rendered);
    const model = xModel(titel);
    const isX = /x-?yachts/i.test(titel) || /^(X[cpr]?\s?-?\d|IMX|X\d)/i.test(titel);
    if (!model || !isX) continue;
    const st = b.class_list.find((c) => c.startsWith('status-van-boot-')) ?? '';
    if (/verkocht/.test(st)) { rijen.push({ url: b.link, extern_id: String(b.id), model_ruw: model, status: 'verkocht', verkoper: 'Escape Yachting' }); continue; }
    getoond++;
    await pauze(1500);
    const d = tekst(await haal(b.link));
    const jaar = Number(d.match(/Bouwjaar:?\s*(\d{4})/)?.[1]) || null;
    const lig = d.match(/Ligplaats:?\s*([^\n]+)/)?.[1]?.trim() ?? null;
    const prijsTekst = d.match(/€\s?[\d.]+(?:,\d{2})?[^\n]{0,25}/)?.[0]?.trim() ?? null;
    rijen.push({
      url: b.link, extern_id: String(b.id), model_ruw: model, bouwjaar: jaar, verkoper: 'Escape Yachting',
      ligplaats: lig ? lig.split('–')[0].trim() : null, land: land(lig) ?? 'Netherlands',
      prijs_tekst: prijsTekst, vraagprijs: bedragEU(prijsTekst), valuta: prijsTekst ? 'EUR' : null,
      btw: /incl/i.test(prijsTekst ?? '') ? 'betaald' : null,
      status: /onder[- ]optie|onder[- ]bod|gereserveerd/.test(st) ? 'onder_bod' : 'te_koop',
      rompnummer: d.match(/Rompnummer:?\s*#?(\d+)/)?.[1] ?? null,
      hin: d.match(/HIN[^:]*:?\s*([A-Z]{2}-?[A-Z0-9]{9,14})/)?.[1] ?? null,
    });
  }
  return { rijen, getoond };
}

// ---------------- Barth Yachts (X-Yachts Germany) ----------------
// De startpagina toont hun aanbod; links /boat-details/x-yachts-…; per boot één detailpagina.
export async function barth(): Promise<{ rijen: Rij[]; getoond: number | null }> {
  const home = await haal('https://www.barthyachts.de/');
  const alle = [...new Set([...home.matchAll(/href="(\/boat-details\/[a-z0-9-]+)"/g)].map((m) => m[1]))];
  const x = alle.filter((u) => /x-yachts|\/x[cp]?-?\d|imx/i.test(u));
  const rijen: Rij[] = [];
  for (const pad of x) {
    await pauze(1500);
    const url = `https://www.barthyachts.de${pad}`;
    const d = tekst(await haal(url));
    const model = d.match(/Modell\s+([^\n]+?)\s+(?:Länge|Lange)/)?.[1]?.trim() ?? xModel(pad.replace(/-/g, ' ')) ?? pad;
    const jaar = Number(d.match(/Baujahr\s+(\d{4})/)?.[1]) || null;
    const prijsTekst = d.match(/Verkaufspreis\s+(EUR\s?[\d.,]+[^\n]{0,30})/)?.[1]?.trim() ?? null;
    const lig = d.match(/(?:Liegeplatz|Standort|Liegeort)\s+([^\n]+)/)?.[1]?.trim() ?? null;
    rijen.push({
      url, extern_id: pad.split('/').pop()!, model_ruw: model, bouwjaar: jaar, verkoper: 'Barth Yachts',
      ligplaats: lig ? lig.split('>').pop()!.trim() : null, land: land(lig), prijs_tekst: prijsTekst, vraagprijs: bedragEU(prijsTekst), valuta: prijsTekst ? 'EUR' : null,
      btw: /inkl/i.test(prijsTekst ?? '') ? 'betaald' : /exkl|zzgl/i.test(prijsTekst ?? '') ? 'exclusief' : null,
      status: /\b(reserviert|unter vertrag)\b/i.test(d.slice(0, 800)) ? 'onder_bod' : 'te_koop',
    });
  }
  return { rijen, getoond: null }; // startpagina toont alle merken; geen X-Yachts-teller
}

// ---------------- Media Ship International ----------------
// Eén merkpagina met alle X-Yachts; robots.txt vraagt 60 s tussen verzoeken, dus maar één verzoek.
const IT_REGIO: Record<string, string> = { 'costa azzurra': 'France', francia: 'France', croazia: 'Croatia', grecia: 'Greece',
  spagna: 'Spain', slovenia: 'Slovenia', montenegro: 'Montenegro', malta: 'Malta', turchia: 'Turkey' };
export async function mediaship(): Promise<{ rijen: Rij[]; getoond: number | null }> {
  const html = await haal('https://www.mediaship.it/boat-cmp/x-yachts');
  const getoond = Number(html.match(/viewing (\d+) boats/i)?.[1]) || null;
  const rijen: Rij[] = [];
  for (const kaart of html.split('class="boat-item').slice(1)) {
    const id = kaart.match(/data-boat-id="(\d+)"/)?.[1];
    const url = kaart.match(/href="(https:\/\/www\.mediaship\.it\/barca\/[^"]+)"/)?.[1];
    if (!id || !url) continue;
    const t = tekst(kaart).replace(/\s+/g, ' ');
    const jm = t.match(/\b(19[5-9]\d|20[0-3]\d)\b\s*([A-ZÀ-Ú][A-ZÀ-Ú' ]{2,30})?/);
    const regio = jm?.[2]?.trim() || null;
    const prijsTekst = t.match(/EUR\s?[\d.]+(?:,\d{2})?/)?.[0] ?? null;
    const r = (regio ?? '').toLowerCase();
    rijen.push({
      url, extern_id: id, model_ruw: (xModel(t) ?? '').replace(/^X\s(?=\d)/i, 'X-') || null,
      bouwjaar: jm ? Number(jm[1]) : null, verkoper: 'Media Ship International',
      ligplaats: regio, land: Object.entries(IT_REGIO).find(([s]) => r.includes(s))?.[1] ?? (regio ? 'Italy' : null),
      prijs_tekst: prijsTekst, vraagprijs: bedragEU(prijsTekst), valuta: prijsTekst ? 'EUR' : null, btw: null,
      status: /venduta|\bsold\b/i.test(t) ? 'verkocht' : /trattativa in corso|sotto offerta/i.test(t) ? 'onder_bod' : 'te_koop',
    });
  }
  return { rijen, getoond };
}
