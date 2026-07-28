# Relais paiement Money Fusion — sur Hostinger (PHP)

Ces fichiers PHP font les appels à Money Fusion depuis l'**IP fixe de ton
hébergement Hostinger** (la seule autorisée par Money Fusion). Le site (sur
Vercel) ne parle jamais à Money Fusion directement — il passe par ce relais.

---

## Étape 1 — Créer un sous-domaine `pay.bwebagence.com` sur Hostinger

Dans **hPanel → Sites web → Sous-domaines** (ou Domaines) :
- crée le sous-domaine **`pay`** (→ `pay.bwebagence.com`).
- Hostinger crée un dossier (ex. `public_html/pay/`) et un **SSL gratuit** automatiquement.

> Ton domaine bwebagence.com pointe vers Vercel, mais un sous-domaine `pay.`
> peut être servi par Hostinger. Si le DNS est géré ailleurs, ajoute un
> enregistrement **A** `pay` → l'IP de ton hébergement Hostinger.

## Étape 2 — Envoyer les fichiers

Via **hPanel → Gestionnaire de fichiers** (ou FTP), copie le contenu de ce dossier
`payment-php/` dans le dossier du sous-domaine (`public_html/pay/`).

## Étape 3 — Relever l'IP à whitelister 🎯

Ouvre dans le navigateur :

```
https://pay.bwebagence.com/ipcheck.php
```

Note la valeur **`ip_sortie_a_whitelister`**.
👉 **C'est cette IP qu'on met dans « Adresses IP autorisées » chez Money Fusion.**
Tu peux alors valider le formulaire et récupérer ton **lien API**.

> ⚠️ Supprime `ipcheck.php` une fois l'IP relevée.

## Étape 4 — Remplir le formulaire Money Fusion

| Champ | Valeur |
|---|---|
| Nom du site/App | `Bweb Agence` |
| Adresse site/application | `https://www.bwebagence.com/` |
| URL de redirection après paiement | `https://www.bwebagence.com/formations/paiement-retour` |
| Adresses IP autorisées | **la valeur relevée à l'étape 3** |

## Étape 5 — Renseigner les identifiants

Ouvre `config.php` (sur Hostinger) et complète :
- `MONEYFUSION_API_URL` = le lien API reçu après création de l'app,
- `MONEYFUSION_VERIFY_URL` = le lien de vérification (dashboard/doc).

## Étape 6 — Côté site Vercel

Ajoute la variable d'environnement (Vercel → Settings → Environment Variables) :

```
PAYMENT_API_URL = https://pay.bwebagence.com
```

## Test rapide

- `https://pay.bwebagence.com/status.php?token=xxx` doit répondre du JSON.
- Le bouton « Payer » (à ajouter sur les formations) appellera `pay.php`, puis
  redirigera l'acheteur vers l'URL renvoyée. Retour sur `/formations/paiement-retour`.

## Fichiers

- `config.php` — configuration (à compléter)
- `pay.php` — crée un paiement → `{ ok, url, token }`
- `status.php` — vérifie le statut → `{ ok, statut, montant }`
- `webhook.php` — notification Money Fusion (à brancher sur Supabase + e-mail)
- `ipcheck.php` — révèle l'IP de sortie (à supprimer après usage)
