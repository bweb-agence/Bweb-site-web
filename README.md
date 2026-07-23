# Site web — Bweb Agence

Site vitrine de Bweb Agence (conseil, formation, digitalisation, automatisation & IA), en **HTML / CSS / JavaScript vanilla + GSAP**, sans framework ni étape de build côté navigateur.

## Structure

```
bweb-agence-site/
├── index.html                     Accueil
├── a-propos.html
├── services.html                  Vue d'ensemble des services
├── services-*.html                6 pages détaillées par service
├── realisations.html              Portfolio + études de cas
├── formations.html
├── methodologie.html
├── contact.html
├── devis.html                     Demande de devis détaillée
├── merci.html                     Page de remerciement (redirection formulaires)
├── mentions-legales.html
├── politique-confidentialite.html
├── conditions-generales.html
├── 404.html
├── assets/
│   ├── css/style.css              Design system (variables, composants, responsive)
│   ├── js/main.js                 Nav, GSAP, formulaires, compteurs, filtres
│   └── images/                    Logo + favicon (SVG)
└── _build/                        Outil de génération (voir plus bas) — n'est pas servi au public
```

Toutes les pages sont des fichiers HTML statiques autonomes : aucun serveur ni build n'est nécessaire, il suffit de les héberger tel quel (GitHub Pages, Netlify, hébergement mutualisé…).

## Outil d'assemblage (`_build/`)

Pour éviter de dupliquer le header/footer dans chaque page à la main, les pages (hors `index.html` et `a-propos.html`, écrites directement) sont générées à partir de :

- `_build/partials/head.html`, `header.html`, `footer.html`
- `_build/content/*.content.html` (contenu propre à chaque page)
- `_build/manifest.json` (titre + meta description par page)

Pour régénérer les pages après une modification d'un partial ou d'un contenu :

```bash
node _build/build.js
```

Le script écrit les fichiers `.html` finaux à la racine du projet (ce sont ces fichiers, statiques, qui sont réellement servis).

## À compléter avant mise en ligne

Le contenu réel de l'agence n'était pas toutes disponible à la création du site. Chercher `badge-placeholder` et `placeholder-note` dans le code, ou les points suivants :

- **Coordonnées réelles** dans `assets/js/main.js` (`window.BWEB_CONFIG` : numéro WhatsApp, téléphone, e-mail) — actuellement des valeurs d'exemple.
- **Adresse physique et carte de localisation** (page Contact + footer).
- **Témoignages clients réels** (page d'accueil) — actuellement des exemples génériques.
- **Fiches équipe** (page À propos) — seul le fondateur, Godwin Soola, est confirmé.
- **Études de cas ACOPCI / Ivoire 2C** (page Réalisations) — références confirmées mais détails/chiffres à valider avec les clients avant publication.
- **Mentions légales / CGV** — trame juridique standard à faire relire et compléter (forme juridique, n° RCCM, hébergeur…) par un professionnel.
- **Formulaires (Contact / Devis)** : aucun backend n'est branché. Il faut connecter un service d'envoi (Formspree, EmailJS, Make/Zapier, fonction serverless…) pour que les demandes arrivent réellement par e-mail — voir le commentaire dans `assets/js/main.js` (`initForms`).
- **Génération d'images IA** : demandée dans le brief, mais indisponible au moment de la création (crédits épuisés côté outil de génération). Le site utilise à la place des visuels CSS/SVG (mockups d'écran, dégradés de marque, icônes). Ils peuvent être remplacés par de vraies photos/visuels générés ultérieurement, dans `assets/images/`.

## Stack

- HTML5 / CSS3 (variables custom, Grid, Flexbox, `clamp()`)
- JavaScript vanilla (pas de dépendance npm côté site)
- [GSAP](https://gsap.com/) + ScrollTrigger via CDN pour les animations
- Police : Plus Jakarta Sans (texte) + Sora (titres), via Google Fonts
