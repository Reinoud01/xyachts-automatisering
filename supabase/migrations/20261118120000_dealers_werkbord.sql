-- Werkbord-website (X-Agent): welke dealer heeft welk schema, en welk mailadres hoort bij welke dealer.
-- Centraal in public; bevat alleen namen en mailadressen van gebruikers, geen klantdata.
-- Alleen de service role (edge function werkbord) kan erbij: RLS aan, geen policies.
create table if not exists public.dealers (
  dealer_id   text primary key,              -- gelijk aan het schema, bv. 'xyb'
  naam        text not null,
  actief      boolean not null default true,
  aangemaakt_op timestamptz not null default now(),
  constraint dealer_id_schema check (dealer_id ~ '^[a-z][a-z0-9_]{1,30}$')
);
create table if not exists public.dealer_gebruikers (
  email       text primary key check (email = lower(email)),
  dealer_id   text not null references public.dealers(dealer_id),
  naam        text,
  rol         text not null default 'medewerker' check (rol in ('medewerker','lezen','beheer')),
  actief      boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);
alter table public.dealers enable row level security;
alter table public.dealer_gebruikers enable row level security;
revoke all on public.dealers, public.dealer_gebruikers from anon, authenticated;

insert into public.dealers (dealer_id, naam) values ('xyb', 'X-Yachts Benelux') on conflict do nothing;
insert into public.dealer_gebruikers (email, dealer_id, naam, rol) values
  ('nanno@x-yachts.nl', 'xyb', 'Nanno', 'medewerker'),
  ('nikki@x-yachts.nl', 'xyb', 'Nikki', 'medewerker'),
  ('reinoud.tencate@gmail.com', 'xyb', 'Reinoud', 'beheer')
on conflict do nothing;
