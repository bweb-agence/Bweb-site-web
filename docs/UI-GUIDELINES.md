# Règles UI — Admin Bweb

Objectif : **cohérence visuelle** et **espacements maîtrisés**. Ce document est la
référence pour toute nouvelle interface admin.

## Stack

- **Vitrine** : CSS maison (`src/styles/*.css`) + composants `.astro`. **Ne pas**
  y importer Tailwind (pas de reset global en prod).
- **Admin** : **Tailwind v4 + Starwind UI**, chargés uniquement via
  `src/styles/starwind.css` (importé par `AdminLayout` / `EditorLayout`).
  Composants dans `src/components/starwind/`.
- **Couleurs** : une seule source. Les tokens Starwind (`--primary`, `--muted`,
  `--border`…) sont remappés sur la palette Bweb dans `starwind.css`, elle-même
  alignée sur `src/styles/tokens.css`. **Ne jamais** écrire une couleur en dur.

## Échelle d'espacement (la règle la plus importante)

Tailwind = échelle de **4 px** (`1` = 4px, `2` = 8px, `3` = 12px, `4` = 16px,
`5` = 20px, `6` = 24px, `8` = 32px…). **On n'utilise QUE cette échelle** — jamais
de valeurs arbitraires type `p-[13px]`.

| Usage | Valeur | Classe |
|------|--------|--------|
| Rythme entre sections d'une page | 24 px | `space-y-6` |
| Padding intérieur d'une carte | 20–24 px | `p-5` / `p-6` |
| Gap dans une grille de cartes | 16 px | `gap-4` |
| Gap icône ↔ texte | 12–14 px | `gap-3` / `gap-3.5` |
| Gap entre puces / petits éléments | 6–8 px | `gap-1.5` / `gap-2` |
| Padding d'en-tête de panneau | 16–20 px | `px-5 py-4` |

**Règles :**
1. Une page = un conteneur `space-y-6` pour le rythme vertical. Pas de marges
   ad hoc entre blocs.
2. À l'intérieur d'un composant, l'espacement vient de **`gap`** (flex/grid),
   pas de marges sur les enfants.
3. Padding **symétrique** par défaut (`p-5`), sauf en-têtes (`px-5 py-4`).
4. Grilles responsives : `grid-cols-2 gap-4 lg:grid-cols-4` (jamais de largeurs
   fixes en px).

## Couleurs (tokens sémantiques)

| Rôle | Classe |
|------|--------|
| Fond de page / carte | `bg-background` / `bg-card` |
| Texte principal / secondaire | `text-foreground` / `text-muted-foreground` |
| Action principale | `bg-primary text-primary-foreground` |
| Bordures | `border-border` |
| États | `success` · `warning` · `error` · `info` (paires `bg-*` / `text-*-foreground`) |

Marque directe si besoin : `text-blue`, `bg-navy`, `text-green`…

## Composants

- **Nouveaux écrans admin** → composants **Starwind** (`Card`, `Button`, `Badge`,
  `Input`, `Select`, `Label`…). Ajouter un composant : `npx starwind@latest add <nom>`.
- **Titres** : `font-display` (Sora) ; corps : `font-sans`.
- **Migration progressive** : les écrans existants gardent les classes maison
  (`.abtn`, `.tag-pill`, `.admin-table`, `.a-drawer`…) — on migre **un écran à la
  fois** vers Starwind, jamais de big-bang. Le rendu client-side (`innerHTML` dans
  les scripts) continue d'utiliser les classes maison (les composants `.astro` n'y
  sont pas utilisables) ; la CSS reste partagée.

## Responsive & anti-débordement (règles)

> **Règle d'or : un élément ne doit JAMAIS déborder de son parent.** Si ça casse
> le design, on contient (troncature/retour à la ligne/scroll interne), on ne
> laisse pas la page défiler horizontalement.

Garde-fous déjà en place dans `admin.css` (section « Garde-fous responsive ») :
- `.admin-content { overflow-x: clip }` → **la page ne défile jamais en
  horizontal**. Les zones scrollables volontaires (tables) utilisent un wrapper
  `.overflow-x-auto` qui scrolle **en interne**.
- `min-width: 0` sur les enfants de flex/grid (`.sw :where(.grid,.flex) > *`) →
  corrige le débordement flex (sinon un enfant refuse de rétrécir).
- `max-width: 100%` sur `img/svg/video/canvas`.
- `overflow-wrap: anywhere` **ciblé** sur les champs à longue chaîne sans espace
  (e-mails, URLs). **Jamais globalement** — ça couperait nombres et titres en
  plein milieu (« 83 00·0 F CFA », « PROSPEC·TS »).

**Réduire les polices pour la responsivité.** Sur petits écrans, on réduit les
tailles plutôt que de laisser déborder :
- Utilitaires responsives Tailwind : `text-lg sm:text-xl md:text-2xl`,
  `p-3.5 sm:p-5`, `size-9 sm:size-11`, `gap-2.5 sm:gap-3.5`.
- Media query `@media (max-width: 640px)` dans `admin.css` : réduit `.admin-table`,
  titres de la topbar, valeurs KPI, etc.
- Les **valeurs longues** (montants « 83 000 F CFA ») : réduire la police ET
  resserrer le conteneur (icône/padding plus petits) pour éviter les retours à
  la ligne disgracieux.
- Le **texte identifiant** (e-mail, nom) tronque avec ellipsis
  (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) plutôt que
  de pousser la mise en page.

## Checklist de cohérence (avant de livrer un écran)

- [ ] Rythme vertical en `space-y-*` (pas de marges isolées).
- [ ] Espacements uniquement sur l'échelle 4px.
- [ ] Aucune couleur en dur (tokens uniquement).
- [ ] Rayons via l'échelle (`rounded-md/lg/xl`).
- [ ] Composants Starwind pour tout élément interactif nouveau.
- [ ] Testé responsive (mobile 375 / tablette 768 / desktop).
- [ ] **Aucun débordement horizontal** (`document.documentElement.scrollWidth === clientWidth`).
- [ ] Polices réduites sur mobile (utilitaires `sm:`/`md:`), rien qui casse en pleine page.
- [ ] `font-display` sur les titres.

## Référence

- Tokens de marque : `src/styles/tokens.css`
- Thème Starwind (remappé Bweb) : `src/styles/starwind.css`
- Exemple appliqué : `src/pages/admin/index.astro` (tableau de bord)
