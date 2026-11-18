-- Status 'geannuleerd' bestaat op het werkbord maar ontbrak in de database.
alter table xyb.onderdeel_aanvragen drop constraint onderdeel_aanvragen_status_check;
alter table xyb.onderdeel_aanvragen add constraint onderdeel_aanvragen_status_check
  check (status = any (array['nieuw','info nodig','bij leverancier','offerte naar klant','besteld','geleverd',
                             'niet leverbaar','geannuleerd','vervallen']));
