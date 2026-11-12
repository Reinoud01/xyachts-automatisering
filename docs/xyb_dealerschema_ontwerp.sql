-- Dealerschema X-Yachts Benelux (xyb) in project botenhulp.
-- Centraal (alle dealers) blijft in public. xyb mag naar public verwijzen, nooit andersom.
-- LET OP: toegepaste versie wijkt licht af (extra indexen op FK's, agent_runs voor mail_wachtrij).
-- Haal de exacte versie op met `supabase db pull` bij het opzetten van de repo.
-- Alleen de service role komt erbij (RLS aan, geen policies) tot de werkbordpagina een login krijgt.

create schema if not exists xyb;
comment on schema xyb is 'Dealerdata X-Yachts Benelux: klanten, aanvragen, leads, prijzen, mail-wachtrij, runlog. Nooit in public.';

revoke all on schema xyb from public, anon, authenticated;
grant usage on schema xyb to service_role;

-- Hulpfunctie: bijgewerkt_op automatisch zetten
create or replace function xyb.zet_bijgewerkt_op() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.bijgewerkt_op := now();
  return new;
end $$;

-- ===================== Klanten en boten =====================
create table xyb.klanten (
  klant_id      bigint generated always as identity primary key,
  naam          text not null,
  email         text,
  telefoon      text,
  adres         text,
  land          text,
  taal          text,
  opmerking     text,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);
create unique index klanten_email_uniek on xyb.klanten (lower(email)) where email is not null and email <> '';

create table xyb.klant_boten (
  boot_id       bigint generated always as identity primary key,
  klant_id      bigint references xyb.klanten(klant_id),
  model_id      text references public.modellen(model_id),
  model_ruw     text,
  bouwnummer    text,
  hin           text,
  bootnaam      text,
  bouwjaar      integer,
  motor         text,
  ligplaats     text,
  opmerking     text,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);
create index on xyb.klant_boten (klant_id);
create index on xyb.klant_boten (model_id);

-- ===================== Leveranciers (lokaal) en prijsafspraken =====================
create table xyb.lokale_leveranciers (
  leverancier_id text primary key,
  naam           text not null,
  soort          text,            -- timmerman, rigger, winkel, zeilmaker, ...
  contactpersoon text,
  email          text,
  telefoon       text,
  land           text,
  opmerking      text,
  actief         boolean not null default true,
  aangemaakt_op  timestamptz not null default now(),
  bijgewerkt_op  timestamptz not null default now()
);

-- Prijsafspraak met een centrale of lokale leverancier (precies één van beide)
create table xyb.prijsafspraken (
  afspraak_id           bigint generated always as identity primary key,
  leverancier_id        text references public.ond_leveranciers(leverancier_id),
  lokale_leverancier_id text references xyb.lokale_leveranciers(leverancier_id),
  merk_id               text references public.ond_merken(merk_id),
  korting_inkoop_pct    numeric,
  opslag_verkoop_pct    numeric,
  valuta                text default 'EUR',
  vracht_regel          text,
  voorwaarden           text,
  geldig_vanaf          date,
  geldig_tot            date,
  bron                  text,
  aangemaakt_op         timestamptz not null default now(),
  bijgewerkt_op         timestamptz not null default now(),
  constraint prijsafspraak_een_leverancier check (num_nonnulls(leverancier_id, lokale_leverancier_id) = 1)
);

create table xyb.voorraad (
  voorraad_id   bigint generated always as identity primary key,
  artikel_id    bigint references public.ond_artikelen(artikel_id),
  artikelnummer text,
  omschrijving  text,
  aantal        numeric not null default 0,
  locatie       text,
  opmerking     text,
  aangemaakt_op timestamptz not null default now(),
  bijgewerkt_op timestamptz not null default now()
);

-- ===================== Onderdelenaanvragen (werkbord 'onderdelen') =====================
create table xyb.onderdeel_aanvragen (
  aanvraag_id           text primary key,          -- zelfde vorm als werkbord: a-YYYY-MM-DD-naam
  datum                 date not null default current_date,
  kanaal                text not null default 'email'
                         check (kanaal in ('email','formulier','telefoon','balie','anders')),
  mailbox               text,
  klant_id              bigint references xyb.klanten(klant_id),
  klant_naam            text,
  klant_email           text,
  boot_id               bigint references xyb.klant_boten(boot_id),
  boottype              text,
  bouwnummer            text,
  leverancier_id        text references public.ond_leveranciers(leverancier_id),
  lokale_leverancier_id text references xyb.lokale_leveranciers(leverancier_id),
  leverancier_tekst     text,
  omschrijving          text not null,             -- NL, zoals op het werkbord
  omschrijving_lev      text,                      -- EN, richting leverancier
  artikel_id            bigint references public.ond_artikelen(artikel_id),
  artikelnummer         text,
  categorie             text,
  aantal                numeric default 1,
  status                text not null default 'nieuw'
                         check (status in ('nieuw','info nodig','bij leverancier','offerte naar klant',
                                           'besteld','geleverd','niet leverbaar','vervallen')),
  status_sinds          date default current_date,
  prijs_inkoop          numeric,
  prijs_verkoop         numeric,
  vracht_inkoop         numeric,
  vracht_verkoop        numeric,
  valuta                text default 'EUR',
  levertijd             text,
  onderwerp_mail        text,
  mail_conversation_id  text,
  clickup_task_id       text,
  visma_offerte_id      text,
  notitie               text,
  aangemaakt_op         timestamptz not null default now(),
  bijgewerkt_op         timestamptz not null default now()
);
create index on xyb.onderdeel_aanvragen (status);
create index on xyb.onderdeel_aanvragen (klant_id);
create index on xyb.onderdeel_aanvragen (mail_conversation_id);
create unique index onderdeel_aanvragen_clickup on xyb.onderdeel_aanvragen (clickup_task_id) where clickup_task_id is not null;

create table xyb.aanvraag_bijlagen (
  bijlage_id    bigint generated always as identity primary key,
  aanvraag_id   text not null references xyb.onderdeel_aanvragen(aanvraag_id),
  bestandsnaam  text,
  pad           text,          -- SharePoint-pad of storage-pad, geen inhoud
  soort         text,
  aangemaakt_op timestamptz not null default now()
);
create index on xyb.aanvraag_bijlagen (aanvraag_id);

-- ===================== Occasion-leads (werkbord 'occasions') =====================
create table xyb.occasion_leads (
  lead_id           text primary key,             -- zelfde id als werkbord (uuid of o-YYYY-...)
  datum             date not null default current_date,
  naam              text,
  email             text,
  telefoon          text,
  klant_id          bigint references xyb.klanten(klant_id),
  boot              text,                          -- zoals de klant/het werkbord het noemt
  boot_id           text references public.boten(boot_id),
  vraag             text,
  status            text not null default 'nieuw'
                     check (status in ('nieuw','vraag beantwoord','bezichtiging','in onderhandeling','verkocht','afgehaakt')),
  status_voorstel   jsonb,                         -- {status, reden, bron, datum} van agent of Voys
  volgende_stap     text,
  laatste_opvolging date,
  bron              text,                          -- mail, telefoon, website, beurs, ...
  mailbox           text,
  mail_conversation_id text,
  notitie           text,
  aangemaakt_op     timestamptz not null default now(),
  bijgewerkt_op     timestamptz not null default now()
);
create index on xyb.occasion_leads (status);
create index on xyb.occasion_leads (lower(email));
create index on xyb.occasion_leads (boot_id);

-- ===================== Gebeurtenissen (tijdlijn per aanvraag of lead) =====================
create table xyb.gebeurtenissen (
  id            bigint generated always as identity primary key,
  onderwerp     text not null check (onderwerp in ('onderdeel','occasion','klant')),
  onderwerp_id  text not null,
  soort         text not null,       -- status, mail_in, concept, gesprek, notitie, ...
  tekst         text,
  data          jsonb,
  door          text not null default 'agent',   -- agent, nanno, nikki, fabricio, reinoud, voys
  op            timestamptz not null default now()
);
create index on xyb.gebeurtenissen (onderwerp, onderwerp_id, op desc);

-- ===================== Mail-wachtrij en Graph delta =====================
create table xyb.mail_wachtrij (
  mail_id              bigint generated always as identity primary key,
  mailbox              text not null,
  graph_message_id     text not null,
  internet_message_id  text,
  conversation_id      text,
  ontvangen_op         timestamptz,
  van                  text,
  onderwerp            text,
  voorbeeld            text,
  proces               text check (proces in ('onderdelen','occasions','yachtworld','dragonfly','overig')),
  status               text not null default 'nieuw'
                        check (status in ('nieuw','bezig','klaar','overgeslagen','fout','handmatig')),
  pogingen             integer not null default 0,
  volgende_poging_op   timestamptz,
  laatste_fout         text,
  run_id               bigint,
  opgehaald_op         timestamptz not null default now(),
  verwerkt_op          timestamptz,
  constraint mail_uniek unique (mailbox, graph_message_id)
);
create index on xyb.mail_wachtrij (status, volgende_poging_op);
create index on xyb.mail_wachtrij (conversation_id);

create table xyb.graph_delta (
  mailbox       text primary key,
  map           text not null default 'inbox',
  delta_link    text,
  laatst_gelopen timestamptz,
  bijgewerkt_op timestamptz not null default now()
);

-- ===================== Runlog van agent en vaste taken =====================
create table xyb.agent_runs (
  run_id        bigint generated always as identity primary key,
  taak          text not null,          -- mail-ophalen, onderdelen, occasions, aanbodronde, backup, monitor, ...
  mail_id       bigint references xyb.mail_wachtrij(mail_id),
  gestart_op    timestamptz not null default now(),
  klaar_op      timestamptz,
  status        text not null default 'bezig' check (status in ('bezig','ok','fout','afgebroken')),
  model         text,
  tokens_in     integer,
  tokens_uit    integer,
  kosten_usd    numeric(10,4),
  stappen       jsonb,                  -- [{tool, resultaat, ms}, ...] zonder mailinhoud of geheimen
  tellingen     jsonb,
  fout          text
);
create index on xyb.agent_runs (taak, gestart_op desc);
create index on xyb.agent_runs (status) where status <> 'ok';
alter table xyb.mail_wachtrij add constraint mail_run_fk foreign key (run_id) references xyb.agent_runs(run_id);

-- ===================== Monitoring =====================
-- Vervaldata van sleutels (alleen naam en datum, nooit de sleutel zelf)
create table xyb.sleutels (
  naam          text primary key,       -- bv. entra-client-secret, visma-refresh, voys-api
  waar          text,                   -- 'supabase secret', 'tabel visma_tokens', ...
  verloopt_op   date,
  opmerking     text,
  bijgewerkt_op timestamptz not null default now()
);

-- Verwachte taken: hoe vaak moeten ze minimaal gelopen hebben
create table xyb.taken (
  taak          text primary key,
  omschrijving  text,
  max_uren_stil numeric not null,       -- melding als langer dan dit niets gelopen is
  alleen_werkdagen boolean not null default false,
  actief        boolean not null default true
);

-- ===================== Triggers bijgewerkt_op =====================
do $$
declare t text;
begin
  foreach t in array array['klanten','klant_boten','lokale_leveranciers','prijsafspraken','voorraad',
                           'onderdeel_aanvragen','occasion_leads','graph_delta','sleutels'] loop
    execute format('create trigger zet_bijgewerkt_op before update on xyb.%I
                    for each row execute function xyb.zet_bijgewerkt_op()', t);
  end loop;
end $$;

-- ===================== RLS aan op alles, alleen service role =====================
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'xyb' loop
    execute format('alter table xyb.%I enable row level security', r.tablename);
  end loop;
end $$;

grant all on all tables in schema xyb to service_role;
grant usage, select on all sequences in schema xyb to service_role;
grant execute on all functions in schema xyb to service_role;
alter default privileges in schema xyb grant all on tables to service_role;
alter default privileges in schema xyb grant usage, select on sequences to service_role;
alter default privileges in schema xyb grant execute on functions to service_role;
revoke execute on function xyb.zet_bijgewerkt_op() from public, anon, authenticated;
