// Eén blok per bron. Een nieuwe bron = een nieuw blok met ophalen() dat Rij[] teruggeeft.
// De ophaler meldt zich met een eigen naam en volgt robots.txt. Sites die cloudverkeer weigeren of
// automatisch ophalen verbieden (Boat24, TheYachtMarket, Yachtall, YachtWorld/boats.com, Scanboat,
// Blocket, DBA, FINN) en BoatWizard lopen via de geplande taak op Reinouds Mac.
import { UA, devalk, escape, barth, mediaship } from './bronnen_extra.ts';

export type Rij = {
  url: string; extern_id?: string | null; model_ruw?: string | null; bouwjaar?: number | null;
  verkoper?: string | null; ligplaats?: string | null; land?: string | null;
  prijs_tekst?: string | null; vraagprijs?: number | null; valuta?: string | null; btw?: string | null;
  status: 'te_koop' | 'onder_bod' | 'verkocht'; rompnummer?: string | null; hin?: string | null; extra?: unknown;
};
type Bron = { ophalen: () => Promise<{ rijen: Rij[]; getoond: number | null }>; telbaar?: (r: Rij) => boolean };

const ontsnap = (s: string) => s.replace(/&euro;/g, '€').replace(/&pound;/g, '£').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// "€44,000 (VAT Paid)" | "£125,000" | "79,900 CHF (excluding EU VAT)" | "$550,000 USD" | "$590,000 AUD" | "Price on Application"
export function prijs(t: string): { vraagprijs: number | null; valuta: string | null; btw: string | null } {
  const btw = /VAT Paid/i.test(t) ? 'betaald' : /excl/i.test(t) ? 'exclusief' : null;
  const getal = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d+)/);
  if (!getal) return { vraagprijs: null, valuta: null, btw };
  const bedrag = Number(getal[1].replace(/[.,](?=\d{3}\b)/g, ''));
  const code = t.match(/\b(EUR|GBP|USD|AUD|CHF|DKK|SEK|NOK|CAD)\b/)?.[1]
    ?? (t.includes('€') ? 'EUR' : t.includes('£') ? 'GBP' : t.includes('$') ? 'USD' : null);
  return { vraagprijs: bedrag || null, valuta: code, btw };
}

const nietVerkocht = (r: Rij) => r.status !== 'verkocht';

export const BRONNEN: Record<string, Bron> = {
  'x-yachts.com': {
    // De lijst wordt via admin-ajax.php geladen; één POST geeft alle advertenties (incl. verkocht).
    async ophalen() {
      const post = (body: string) => fetch('https://www.x-yachts.com/wp-admin/admin-ajax.php', { method: 'POST', body,
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' } })
        .then((r) => { if (!r.ok) throw new Error(`x-yachts.com HTTP ${r.status}`); return r.text(); });
      const [html, iface] = await Promise.all([post('action=ajax_boats'), post('action=ajax_brokerage&dealer=INT')]);
      const getoond = Number(iface.split('<!--BREAK-->')[0].replace(/\D/g, '')) || null;
      const rijen: Rij[] = [];
      for (const blok of html.split("class='col ").slice(1)) {
        const href = blok.match(/href='(\/en\/brokerage\/[^']+)'/)?.[1];
        if (!href) continue;
        const kop = blok.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] ?? '';
        const model = ontsnap(kop.replace(/<span>[\s\S]*?<\/span>/, ''));
        const romp = kop.match(/<span>#?\s*([^<]+)<\/span>/)?.[1]?.trim() || null;
        const notice = blok.match(/class='notice([^']*)'/)?.[1] ?? '';
        const prijsTekst = ontsnap(blok.match(/<p class='price[^']*'>([\s\S]*?)<\/p>/)?.[1] ?? '');
        const veld = (naam: string) => ontsnap(blok.match(new RegExp(`<p>${naam}:\\s*([\\s\\S]*?)</p>`))?.[1] ?? '') || null;
        const locatie = veld('Location');
        const status = /sold/.test(notice) ? 'verkocht' : /pending/.test(notice) ? 'onder_bod' : 'te_koop';
        rijen.push({
          url: `https://www.x-yachts.com${decodeURI(href)}`, extern_id: href.match(/-(\d+)\/?$/)?.[1] ?? null,
          model_ruw: model, bouwjaar: Number(veld('Built')) || null, verkoper: veld('Dealer'),
          ligplaats: locatie, land: locatie ? locatie.split(',').pop()!.trim() : null,
          prijs_tekst: prijsTekst || null, ...(status === 'verkocht' ? { vraagprijs: null, valuta: null, btw: null } : prijs(prijsTekst)),
          status, rompnummer: romp,
        });
      }
      return { rijen, getoond };
    },
    telbaar: nietVerkocht, // de site telt alleen niet-verkochte boten
  },
  'devalk.nl': { ophalen: devalk, telbaar: nietVerkocht },
  'escape-yachting.com': { ophalen: escape, telbaar: nietVerkocht },
  'barthyachts.de': { ophalen: barth, telbaar: nietVerkocht },
  'mediaship.it': { ophalen: mediaship, telbaar: nietVerkocht },
};
