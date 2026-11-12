-- Schaduwpilot: de agent doet alles behalve echte concepten, categorieën en offertes; die worden hier vastgelegd.
alter table xyb.agent_instellingen add column if not exists schaduw boolean not null default true;
create table if not exists xyb.schaduw_acties (
  id         bigint generated always as identity primary key,
  run_id     bigint references xyb.agent_runs(run_id),
  mail_id    bigint references xyb.mail_wachtrij(mail_id),
  soort      text not null,
  mailbox    text,
  aan        text[],
  onderwerp  text,
  body_html  text,
  data       jsonb,
  op         timestamptz not null default now()
);
create index if not exists schaduw_acties_mail on xyb.schaduw_acties (mail_id);
create index if not exists schaduw_acties_run on xyb.schaduw_acties (run_id);
alter table xyb.schaduw_acties enable row level security;
grant all on xyb.schaduw_acties to service_role;
update xyb.agent_instellingen set model_sorteer = 'claude-haiku-5-5', model_schrijf = 'claude-sonnet-5-5';
alter table xyb.agent_instellingen alter column model_sorteer set default 'claude-haiku-5-5', alter column model_schrijf set default 'claude-sonnet-5-5';
update xyb.sleutels set waar = 'Supabase secret ANTHROPIC_API_KEY', opmerking = 'Workspace X-Yachts Benelux op Reinouds Anthropic-account; gecontroleerd 12-11 via edge function api-test' where naam = 'anthropic-api';
