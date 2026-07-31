-- Phase 3 (B2) : programmation des campagnes e-mail + corps riche (modèle).
--
-- On étend `campaigns` : statut, date programmée, modèle utilisé, corps HTML,
-- instantané des destinataires (pour un envoi différé fiable) et suivi d'erreur.

alter table public.campaigns
  add column if not exists status       text not null default 'sent',
  add column if not exists scheduled_at timestamptz,
  add column if not exists template_id  uuid references public.email_templates(id) on delete set null,
  add column if not exists body_html    text,
  add column if not exists recipients   jsonb not null default '[]'::jsonb,
  add column if not exists error        text,
  add column if not exists sent_at      timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_status_check') then
    alter table public.campaigns add constraint campaigns_status_check
      check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed'));
  end if;
end $$;

-- Index pour le cron : retrouver les campagnes dues.
create index if not exists campaigns_due_idx on public.campaigns (status, scheduled_at);
