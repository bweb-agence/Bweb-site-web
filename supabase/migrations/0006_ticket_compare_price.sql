-- Prix « normal » (barré) pour afficher une promotion sur les tarifs.
-- Le prix payé reste `price` ; `compare_at_price` est le prix de référence, plus élevé.
-- Nullable : pas de promo si non renseigné. Additif — n'affecte pas l'existant.

alter table public.ticket_types
  add column if not exists compare_at_price int;

comment on column public.ticket_types.compare_at_price is
  'Prix normal/de référence en FCFA (barré). NULL = pas de promo. Doit être >= price.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ticket_compare_gte_price'
  ) then
    alter table public.ticket_types
      add constraint ticket_compare_gte_price
      check (compare_at_price is null or compare_at_price >= price);
  end if;
end $$;
