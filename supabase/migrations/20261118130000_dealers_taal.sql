-- Standaardtaal van het werkbord per dealer (gebruiker kan zelf wisselen). X-Yachts Benelux: Nederlands.
alter table public.dealers add column if not exists taal text not null default 'en' check (taal in ('en','nl'));
update public.dealers set taal = 'nl' where dealer_id = 'xyb';
