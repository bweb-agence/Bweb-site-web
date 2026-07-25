# Site web — Bweb Agence

Site vitrine de Bweb Agence (conseil, formation, digitalisation, automatisation & IA), construit avec **Astro** + **GSAP/ScrollTrigger** + **Lenis** + **Lottie**. Sortie 100 % statique (HTML/CSS/JS), hébergeable partout (Netlify, Vercel, GitHub Pages, mutualisé).

## Démarrage

```bash
npm install
npm run dev      # serveur de dev sur http://localhost:4321
npm run build    # génère le site statique dans dist/
npm run preview  # prévisualise le build de production
```

## Stack

| Rôle | Outil |
|---|---|
| Framework / build | [Astro](https://astro.build) (sortie statique, composants, sitemap) |
| Animations scroll | [GSAP](https://gsap.com) + ScrollTrigger (bundlés, pas de CDN) |
| Smooth scroll | [Lenis](https://lenis.studio) |
| Animations vectorielles | [lottie-web](https://airbnb.io/lottie/) |
| Polices | Sora + Plus Jakarta Sans, **auto-hébergées** via Fontsource |

Le motion respecte `prefers-reduced-motion` (aucune animation si l'utilisateur la désactive) et le contenu reste visible même si le JS échoue (le hero n'est jamais masqué par JS).

## Structure

```
bweb-site/
├── astro.config.mjs            Config Astro (site, sitemap)
├── src/
│   ├── config/site.ts          ⭐ Source unique : coordonnées, nav, contact, WhatsApp
│   ├── layouts/BaseLayout.astro Head (SEO, OG, JSON-LD), header/footer, scripts
│   ├── components/             Header, Footer, WhatsAppFloat
│   ├── pages/                  Une page .astro par URL (éditables)
│   ├── scripts/                main, ui, motion (GSAP+Lenis), lottie, forms
│   └── styles/                 Design system : tokens, base, components, utilities
├── public/
│   ├── images/                 Logos, favicon, image de partage (og-cover.jpg)
│   ├── lottie/                 Animations .json (à déposer ici)
│   └── robots.txt
├── _build/  _legacy/           Anciennes sources (référence, non servies) — supprimables
```

## Configuration à compléter avant / après mise en ligne

Tout est centralisé dans **`src/config/site.ts`** :

- ✅ **WhatsApp** (`2250701926028` principal, `2250576792525` secondaire) et **e-mail** `info@bwebagence.com` : déjà renseignés.
- ✅ **Domaine de production** : `https://www.bwebagence.com` (sitemap, URLs canoniques, Open Graph).
- ⚠️ **Envoi e-mail des formulaires** : les demandes partent sur **WhatsApp** (récapitulatif pré-rempli, sans backend) **et** par e-mail via [FormSubmit](https://formsubmit.co) — aucun compte ni clé API.
  **Action unique requise :** au tout premier envoi après mise en ligne, FormSubmit envoie un e-mail de confirmation à `info@bwebagence.com` → cliquer le lien **une seule fois** pour activer la réception.
  *(Alternative : renseigner `forms.formspreeId` pour passer par Formspree.)*
- ⏳ **Réseaux sociaux** : URLs Facebook / Instagram / LinkedIn dans `contact.social` — **vides = icônes masquées** (comptes pas encore créés).

Contenu restant à fournir par l'agence (recherche `badge-placeholder` / « Exemple » / « à confirmer ») :
- Adresse physique + carte de localisation (page Contact), fiches équipe.
- Études de cas ACOPCI / Ivoire 2C (détails à confirmer avec les clients).
- Mentions légales / CGV à faire relire par un professionnel.

> **Note contenu** — La section « Notre engagement » (accueil) présente des promesses assumées par l'agence, **pas** des témoignages clients. Ne pas la transformer en faux avis : publier des témoignages fictifs présentés comme réels est illégal dans de nombreuses juridictions et détruit la crédibilité. Dès que de vrais retours clients sont disponibles, ils peuvent être ajoutés en tant que tels.

## Ajouter une animation Lottie

Déposer un fichier `.json` dans `public/lottie/`, puis dans une page :

```html
<div class="lottie" data-lottie="/lottie/mon-anim.json" style="--lottie-ratio: 16 / 9"></div>
```

Chargement paresseux automatique (au scroll) et rendu figé si l'utilisateur réduit les animations.
