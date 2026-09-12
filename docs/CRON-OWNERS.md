# Propriétaires des déclenchements planifiés

Chaque tâche possède un seul scheduler. Un endpoint peut rester appelable avec
un secret pour le diagnostic manuel, mais ne doit pas être planifié par une
seconde plateforme.

| Tâche | Propriétaire | Déclenchement |
| --- | --- | --- |
| Réconciliation paiements | Vercel | `/api/reconcile-paiements`, quotidien 03:00 UTC |
| Campagnes, rappels, packs et sync Hub | Vercel | `/api/cron/campagnes`, quotidien 06:00 UTC |
| Séquence webinaire du soir | Hermes | crontab serveur, toutes les 10 min entre 17:00 et 20:59 UTC |

Les anciens crons Hostinger/VPS non listés ici ne doivent pas être activés.
Le secret de la ligne Hermes doit être renouvelé dans Vercel avant toute autre
intervention : il a été exposé dans une inspection locale de configuration.
