// Microsoft Graph met de Entra-app (client credentials). Alleen lezen, concepten maken en categorieën zetten.
// Nooit versturen: de app krijgt ook geen Mail.Send.
// Secrets: ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET

let cache: { token: string; tot: number } | null = null;

export function graphIngesteld() {
  return !!(Deno.env.get('ENTRA_TENANT_ID') && Deno.env.get('ENTRA_CLIENT_ID') && Deno.env.get('ENTRA_CLIENT_SECRET'));
}

export async function graphToken(): Promise<string> {
  if (cache && cache.tot > Date.now() + 60_000) return cache.token;
  const tenant = Deno.env.get('ENTRA_TENANT_ID');
  const id = Deno.env.get('ENTRA_CLIENT_ID');
  const secret = Deno.env.get('ENTRA_CLIENT_SECRET');
  if (!tenant || !id || !secret) throw new Error('Entra-app niet ingesteld (ENTRA_TENANT_ID/CLIENT_ID/CLIENT_SECRET ontbreken)');
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Entra token ${r.status}: ${j.error_description ?? j.error}`);
  cache = { token: j.access_token, tot: Date.now() + j.expires_in * 1000 };
  return cache.token;
}

export async function graph(pad: string, init: RequestInit = {}): Promise<any> {
  const methode = (init.method ?? 'GET').toUpperCase();
  if (/\/send(\b|$)|\/sendMail/i.test(pad)) throw new Error('Versturen is niet toegestaan');
  const url = pad.startsWith('http') ? pad : `https://graph.microsoft.com/v1.0${pad}`;
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json', Prefer: 'outlook.body-content-type="text"', ...(init.headers ?? {}) },
  });
  if (r.status === 204) return null;
  const tekst = await r.text();
  if (!r.ok) throw new Error(`Graph ${methode} ${pad.split('?')[0]} → ${r.status}: ${tekst.slice(0, 300)}`);
  return tekst ? JSON.parse(tekst) : null;
}
