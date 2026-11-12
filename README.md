# X-Yachts automatisering

Bouwplan: Claude-doc "Cloudopzet X-Yachts automatisering".
Supabase-project: botenhulp (cqjdqyzsigmsnaffrvmt). Centraal = schema `public`, X-Yachts Benelux = schema `xyb`.

## Inhoud
- `supabase/functions/ophaal` — cloud-ophaler aanbodronde (x-yachts.com, De Valk, Escape, Barth, Mediaship).
- `supabase/functions/mail-ophalen` — fase 2: nieuwe mail via Graph delta-query naar `xyb.mail_wachtrij`.
- `supabase/functions/agent` — fase 2: verwerkt één mail met de skill van het proces via de Claude API. Alleen concepten.
- `supabase/migrations/` — migraties van 12 november (dealerschema, monitoring). Volledige set: zie hieronder.
- `skills/` — nog te vullen met onderdelenaanvragen en occasionsaanvragen (cloudversie).

## Eerste keer opzetten (op de Mac, met Supabase CLI en git)
1. Maak op GitHub een lege privé-repository `xyachts-automatisering`.
2. Pak deze map uit, ga erin en draai:
   supabase link --project-ref cqjdqyzsigmsnaffrvmt
   supabase db pull                       # haalt alle migraties exact op
   for f in voys-sync visma-offerte visma-aanmelden; do supabase functions download $f; done
   git init && git add . && git commit -m "Beginstand 12 november" && git branch -M main
   git remote add origin <url van de repository> && git push -u origin main

## Regels
Geen geheimen in deze repository (alleen Supabase secrets). Elke databasewijziging als migratie.
Niets verwijderen, vervallen markeren. Nooit mail versturen, alleen concepten.

## Secrets voor fase 2 (in Supabase → Edge Functions → Secrets)
ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET (Entra-app van Bart),
ANTHROPIC_API_KEY (API-account X-Yachts), SHAREPOINT_SITE_ID (site DocumentenX-YachtsHolland).
