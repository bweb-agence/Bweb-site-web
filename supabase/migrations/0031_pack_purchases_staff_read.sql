-- Lecture des achats de parcours par le staff (admin ⊆ staff).
-- Sans ça, un commercial (is_admin()=false) ne voit ni le CA packs du tableau
-- de bord, ni la page « Packs vendus ». Additif : n'ouvre que le SELECT.
create policy pack_purchases_staff_read on pack_purchases
  for select using (is_staff());

create policy pack_entitlements_staff_read on pack_entitlements
  for select using (is_staff());
