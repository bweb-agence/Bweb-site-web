# Prompts Codex — Visuels glassmorphism · Page Parcours Initiation

> Générer chaque visuel dans Codex (même outil que les premiers), puis déposer le
> fichier PNG dans `public/images/parcours-initiation/` avec le **nom exact**
> indiqué. La page détecte les fichiers au build : dès qu'un fichier est présent
> et le site redéployé, le visuel remplace automatiquement le fallback.

---

## 🎨 Bloc de style commun (à coller au début de CHAQUE prompt)

```
Rendu 3D glassmorphism premium, verre dépoli translucide avec réfractions douces
et reflets brillants. Palette stricte : bleu électrique #1F6CED, bleu nuit #020B50,
or #FFC72A, vert menthe #00C89E, corail #FF835F, verre transparent incolore.
Éclairage studio doux venant du haut à gauche, ombres portées subtiles et diffuses.
Composition centrée, objet unique bien lisible, aucun texte, aucun fond :
FOND 100 % TRANSPARENT (PNG avec canal alpha).
Même style et même matière que des formes de verre soufflé arrondies, coins doux.
```

*Toujours vérifier avant export : fond réellement transparent (damier visible), format PNG.*

---

## 1 · Les 5 phases du programme

Format : **carré 1024 × 1024**, PNG transparent.
Affichés dans un cadre de verre sur fond bleu nuit → privilégier des objets
lumineux qui ressortent sur fond sombre.

| Fichier | Sujet du prompt |
|---|---|
| `phase-1.png` | Une **ampoule en verre dépoli** lumineuse (filament or brillant) avec une **petite loupe en verre** posée contre elle. Quelques étincelles à 4 branches en or autour. |
| `phase-2.png` | Un **cube-cadeau en verre bleu translucide entrouvert** d'où émerge un **livre numérique (ebook) en verre menthe** lumineux. Une étincelle or. |
| `phase-3.png` | Une **étiquette de prix 3D en verre or** suspendue à un ruban, avec une **étoile en verre bleu** et un petit **badge pourcentage en verre corail**. |
| `phase-4.png` | Une **vitrine de boutique miniature en verre bleu** (auvent arrondi) avec une **pièce de monnaie en verre or** et un **panier en verre menthe** devant. |
| `phase-5.png` | Une **fusée en verre bleu et corail** qui décolle en diagonale avec une **trajectoire en ruban de verre or** et des étoiles en verre autour. |

Exemple de prompt complet (phase 1) :

```
[BLOC DE STYLE COMMUN]
Sujet : une ampoule en verre dépoli lumineuse avec un filament doré brillant,
une petite loupe en verre posée contre elle, deux étincelles à quatre branches
en verre doré qui flottent autour. Carré 1024x1024.
```

---

## 2 · Les 8 icônes bonus

Format : **carré 1024 × 1024**, PNG transparent, **objet unique très simple**
(affiché en 64 px → silhouette lisible, pas de détails fins).

| Fichier | Sujet du prompt |
|---|---|
| `bonus-1.png` | Une **tête de robot amicale en verre bleu** avec des yeux lumineux or (bot IA). |
| `bonus-2.png` | Un **diagramme à 3 barres en verre** (bleu, menthe, or) sur un socle de verre (banque de niches). |
| `bonus-3.png` | Une **ampoule en verre menthe** avec un éclat or (pack d'idées). |
| `bonus-4.png` | Une **plume d'écriture en verre bleu** avec des étincelles or (prompts IA). |
| `bonus-5.png` | Un **cadre de tableau en verre or** avec un pinceau en verre corail (template Canva). |
| `bonus-6.png` | Une **bulle de message en verre menthe** avec un éclair or à l'intérieur (scripts WhatsApp). |
| `bonus-7.png` | **Trois silhouettes de personnes en verre** (bleu, or, menthe) côte à côte (communauté). |
| `bonus-8.png` | Un **bouton play circulaire en verre bleu** entouré d'une **flèche en boucle en verre or** (replays à vie). |

---

## 3 · Portrait de Godwin (cadre glassmorphism)

Fichier : `godwin-portrait.png` — **portrait 4:5** (ex. 1024 × 1280), PNG.
Le cadre en verre est déjà créé en CSS sur la page : il faut seulement une belle
photo au bon format. Dans Codex, **uploader ta photo** puis coller ce prompt :

```
Détoure le sujet de cette photo proprement (cheveux inclus).
Place-le sur un fond dégradé élégant bleu nuit #020B50 vers bleu #1F6CED,
avec deux ou trois formes de verre dépoli floues (bulles et anneaux translucides,
teintes or #FFC72A et menthe #00C89E) flottant derrière le sujet, en arrière-plan doux.
Améliore légèrement l'éclairage du visage (lumière douce studio, rendu naturel,
sans lisser la peau à l'excès). Cadrage buste, format portrait 4:5, haute qualité.
```

> Astuce : utiliser une photo bien éclairée, buste face caméra, sourire —
> la même énergie que le hero du site.

---

## 4 · Checklist d'intégration

1. Générer le visuel dans Codex avec le prompt ci-dessus.
2. Vérifier le fond transparent (sauf portrait) et le format.
3. Renommer le fichier **exactement** comme dans le tableau.
4. Le déposer dans `public/images/parcours-initiation/`.
5. Commit + déploiement → le visuel remplace le fallback automatiquement.

Visuels déjà en place (ne pas écraser) : `hero-cover.webp` (couverture vidéo),
`glass-shapes.webp` (déco hero + section finale), `glass-orbit.webp` (section
solution + section finale).
