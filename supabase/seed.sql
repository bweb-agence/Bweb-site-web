-- =========================================================
-- Bweb Agence — Données de démonstration (remplaçables via l'admin)
-- Idempotent : ré-exécutable sans doublon.
-- =========================================================

-- ---------- Formations ----------
insert into public.formations (slug, title, theme, summary, duration, level, default_price) values
 ('ia-entrepreneurs','Intelligence artificielle pour entrepreneurs','IA','Transformer l''IA en gain de temps concret : cas d''usage métier, prompts réutilisables, automatisations simples.','2 jours (14 h)','Débutant accepté',75000),
 ('publicite-facebook-instagram','Publicité Facebook & Instagram','Marketing','Créer et piloter des campagnes rentables sur Meta.','1 jour (7 h)','Débutant accepté',60000),
 ('whatsapp-business-vente','WhatsApp Business & vente en ligne','Vente en ligne','Vendre et fidéliser efficacement via WhatsApp.','1 jour (7 h)','Débutant accepté',55000)
on conflict (slug) do nothing;

-- Descriptions détaillées (programme) — mises à jour même si la formation existe déjà.
update public.formations set description_md =
E'Deux jours pour transformer l''IA en gain de temps concret : cas d''usage métier, prompts réutilisables et automatisations simples, avec un atelier pratique sur vos propres besoins.\n\n## Au programme\n- Comprendre l''IA et ses usages métier\n- Rédiger des prompts efficaces & réutilisables\n- Automatiser 3 tâches de votre quotidien\n- Atelier pratique sur vos cas réels'
where slug = 'ia-entrepreneurs';
update public.formations set description_md =
E'Une journée pour créer et piloter des campagnes Facebook & Instagram rentables, du ciblage au suivi des conversions.\n\n## Au programme\n- Configurer le Gestionnaire de publicités\n- Cibler la bonne audience\n- Créer des visuels qui convertissent\n- Lire ses résultats et optimiser le budget'
where slug = 'publicite-facebook-instagram';
update public.formations set description_md =
E'Une journée pour transformer WhatsApp Business en véritable outil de vente et de fidélisation.\n\n## Au programme\n- Configurer un profil professionnel\n- Catalogue, réponses rapides et étiquettes\n- Automatiser l''accueil et le suivi\n- Vendre et relancer sans être intrusif'
where slug = 'whatsapp-business-vente';

-- ---------- Sessions ----------
insert into public.sessions (formation_id, slug, title, theme, starts_at, ends_at, status)
select id,'ia-abidjan-2026-07-29','Intelligence artificielle pour entrepreneurs','IA',
       '2026-07-29 09:00+00','2026-07-30 16:30+00','published'
from public.formations where slug='ia-entrepreneurs'
on conflict (slug) do nothing;

insert into public.sessions (formation_id, slug, title, theme, starts_at, ends_at, status)
select id,'pub-fb-abidjan-2026-08-05','Publicité Facebook & Instagram','Marketing',
       '2026-08-05 09:00+00','2026-08-05 16:30+00','published'
from public.formations where slug='publicite-facebook-instagram'
on conflict (slug) do nothing;

insert into public.sessions (formation_id, slug, title, theme, starts_at, ends_at, status)
select id,'whatsapp-abidjan-2026-08-27','WhatsApp Business & vente en ligne','Vente en ligne',
       '2026-08-27 09:00+00','2026-08-27 16:30+00','full'
from public.formations where slug='whatsapp-business-vente'
on conflict (slug) do nothing;

-- ---------- Tarifs ----------
insert into public.ticket_types (session_id, name, price, capacity, sold, badge, sort)
select id,'Inscription anticipée',56000,8,6,'limited',0 from public.sessions where slug='ia-abidjan-2026-07-29'
on conflict (session_id, name) do nothing;
insert into public.ticket_types (session_id, name, price, capacity, sold, badge, sort)
select id,'Inscription standard',75000,10,6,'hot',1 from public.sessions where slug='ia-abidjan-2026-07-29'
on conflict (session_id, name) do nothing;
insert into public.ticket_types (session_id, name, price, capacity, sold, badge, sort)
select id,'Pack Duo (2 places)',130000,2,0,'ok',2 from public.sessions where slug='ia-abidjan-2026-07-29'
on conflict (session_id, name) do nothing;

insert into public.ticket_types (session_id, name, price, capacity, sold, badge, sort)
select id,'Inscription standard',60000,20,17,'hot',0 from public.sessions where slug='pub-fb-abidjan-2026-08-05'
on conflict (session_id, name) do nothing;

insert into public.ticket_types (session_id, name, price, capacity, sold, badge, sort)
select id,'Inscription standard',55000,20,20,null,0 from public.sessions where slug='whatsapp-abidjan-2026-08-27'
on conflict (session_id, name) do nothing;

-- ---------- Articles ----------
insert into public.posts (slug, title, excerpt, category, body_md, author, reading_minutes, status, published_at) values
 ('ia-pme-cote-divoire',
  '5 façons concrètes d''utiliser l''IA dans une PME ivoirienne',
  'Au-delà du buzz : des usages simples qui font gagner du temps dès cette semaine.',
  'IA',
  E'L''intelligence artificielle n''est plus réservée aux grands groupes.\n\n## 1. Rédiger plus vite, mieux\nUn assistant IA bien cadré produit un premier jet en quelques secondes.\n\n## 2. Trier et router les demandes\n- Classer les messages WhatsApp entrants\n- Repérer les demandes urgentes\n- Préparer des réponses types',
  'Équipe Bweb',6,'published','2026-07-24'),
 ('publicite-facebook-erreurs',
  'Publicité Facebook : 4 erreurs qui plombent votre budget',
  'Les fautes les plus courantes qui font grimper votre coût par résultat.',
  'Marketing',
  E'Avant d''augmenter le budget, corrigez d''abord ces erreurs.\n\n## 1. Cibler trop large\n## 2. Un seul visuel\n## 3. Pas de suivi des conversions\n## 4. Couper les campagnes trop tôt',
  'Équipe Bweb',4,'published','2026-07-18'),
 ('automatiser-whatsapp-sans-code',
  'Automatiser WhatsApp Business sans écrire de code',
  'Réponses automatiques, catalogue et suivi client : les bases pour gagner du temps.',
  'Automatisation',
  E'WhatsApp Business offre déjà de quoi automatiser l''essentiel.\n\n## Messages d''accueil et d''absence\n## Réponses rapides\n## Catalogue et étiquettes',
  'Équipe Bweb',5,'published','2026-07-11'),
 ('vendre-produits-digitaux-afrique',
  'Vendre ses premiers produits digitaux en Afrique',
  'De l''idée au premier paiement : un parcours réaliste adapté au marché local.',
  'Vente en ligne',
  E'Le digital ouvre un marché sans stock ni logistique.\n\n## Choisir un produit simple\n## Encaisser (mobile money, Wave)\n## Promouvoir sans budget',
  'Équipe Bweb',7,'published','2026-07-03')
on conflict (slug) do nothing;

-- ---------- FAQ (globale) ----------
insert into public.faqs (question, answer_md, sort)
select v.q, v.a, v.s from (values
  ('Quels sont les moyens de paiement disponibles ?','Wave, Orange Money, Mobile Money (MTN · Moov), ou paiement sur place avec un acompte de 50 %.',0),
  ('Comment se déroule la confirmation après paiement ?','Vous recevez un e-mail de confirmation dès que notre équipe a vérifié votre paiement (sous 24 h).',1),
  ('Puis-je réserver pour plusieurs personnes ?','Oui : choisissez la quantité souhaitée, ou un Pack Duo / Entreprise.',2),
  ('Vais-je recevoir une attestation ?','Oui, une attestation de participation est remise à la fin de la formation.',3),
  ('Puis-je annuler ou reporter mon inscription ?','Contactez-nous au moins 48 h à l''avance pour un report ou un remboursement.',4)
) as v(q,a,s)
where not exists (select 1 from public.faqs f where f.question = v.q and f.formation_id is null);
