# 🎨 Prompts d'illustrations animées — Bweb Agence

Document de prompts prêts‑à‑coller pour générer, sur **ChatGPT**, une illustration animée **propre à chaque page/section** du site.

> **Principe** : chaque illustration a **sa propre métaphore** (pas de « hub central à rayons » répété). Le cosmique (étoiles/astres) est **réservé au branding** (hero d'accueil + logo).

---

## Comment t'en servir (2 min)

1. Ouvre une conversation ChatGPT (GPT‑5 / GPT‑4o).
2. **Colle d'abord le [Bloc marque & specs](#0-bloc-marque--specs--à-coller-une-fois) ci‑dessous** (une seule fois, en haut de la conversation).
3. Puis colle le **prompt de l'illustration** que tu veux (section correspondante). ChatGPT renvoie un **SVG animé autonome** (ou une image si précisé).
4. Envoie‑moi le résultat : **je l'intègre proprement** dans la page (je remplace le placeholder actuel).

**Format par emplacement (le « mix ») :**
- **Heros (fond sombre)** → **SVG animé transparent** (fusionne dans le hero, tes couleurs exactes, ultra léger).
- **Sections claires** → SVG animé (ou image si tu veux un rendu plus illustratif).
- **Photos / captures / carte** → *pas de génération* : vraies photos d'équipe, captures projets, Google Maps.

---

## 0. BLOC MARQUE & SPECS — à coller UNE FOIS

```
Tu es motion-designer et développeur SVG expert. Je vais te demander une SÉRIE d'illustrations animées pour le site de « Bweb », cabinet ivoirien de CONSEIL, FORMATION et ACCOMPAGNEMENT en IA et nouvelles technologies (clients : entreprises, PME, organisations en Côte d'Ivoire et en Afrique). Ton de marque : expert-pédagogue, on vend la décision éclairée et l'autonomie des équipes.

Pour CHAQUE demande, réponds UNIQUEMENT avec un fichier SVG autonome (SVG + CSS dans une balise <style> À L'INTÉRIEUR du <svg>), prêt à coller dans une page web, sans aucune dépendance, image externe ni police externe. Renvoie le code dans un bloc de code, rien d'autre.

RÈGLES TECHNIQUES (toujours) :
- Respecte le viewBox et la taille indiqués. Le SVG est responsive : width:100%, height:auto.
- Fond 100% TRANSPARENT (jamais de rectangle de fond opaque).
- Animations en CSS pur (@keyframes) dans le <style> interne : boucles fluides, mouvement subtil et élégant (flottement, pulsation, tracé qui se dessine, flux lumineux le long des liens/chemins, compteurs qui montent). Élégant, jamais clignotant.
- Ajoute une règle @media (prefers-reduced-motion: reduce) qui désactive les animations.
- Style : moderne, tech, épuré, haut de gamme (niveau Awwwards). Icônes/objets en TRAIT (stroke, coins arrondis), dégradés doux. Sur fond sombre : effet « verre » translucide (remplissages blancs très faibles + fines bordures claires) + halos flous doux qui DÉBORDENT légèrement pour fondre l'illustration dans son arrière-plan.
- Accessibilité : <svg role="img"> avec un <title> décrivant l'illustration.
- Peu ou pas de texte ; si besoin, libellés très courts en français.

PALETTE DE MARQUE (utilise EXACTEMENT ces codes) :
- bleu primaire #1F6CED · bleu foncé #154FB3 · navy #020B50 · turquoise #12A5C0 · vert #00C89E · orange #FF835F · jaune #E0A400 · bleu ciel #D4F0F6 · blanc #FFFFFF.

INTERDITS :
- Pas d'étoiles, planètes, galaxie, cosmos (réservés au branding du hero d'accueil).
- Pas de « hub central avec rayons vers des nœuds » : cette forme est déjà utilisée, chaque illustration doit avoir une métaphore DIFFÉRENTE.

Pour chaque demande je préciserai : le FOND cible (sombre = illustration lumineuse translucide qui fusionne / clair = traits navy-bleu sur fond clair), la TAILLE (viewBox), la MÉTAPHORE, les ÉLÉMENTS et le MOUVEMENT. Si j'écris « FORMAT IMAGE », génère une image (illustration vectorielle plate, palette ci-dessus) au lieu d'un SVG.

Confirme que tu as compris, puis attends ma première demande.
```

---

## Récapitulatif des illustrations

| # | ID | Page / Section | Fond | Format | Statut actuel |
|---|---|---|---|---|---|
| 1 | HERO-SERVICES | `/services` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 2 | HERO-CONSEIL | `/services-conseil-strategie` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 3 | HERO-FORMATION | `/services-formation` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 4 | HERO-DIGITALISATION | `/services-digitalisation` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 5 | HERO-SITES-WEB | `/services-creation-sites-web` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 6 | HERO-MARKETING | `/services-marketing-digital` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 7 | HERO-AUTOMATISATION | `/services-automatisation-ia` (hero) | Sombre | SVG animé | ⚠️ mockup chat à remplacer |
| 8 | HERO-APROPOS | `/a-propos` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 9 | HERO-FORMATIONS | `/formations` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 10 | HERO-METHODOLOGIE | `/methodologie` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 11 | HERO-REALISATIONS | `/realisations` (hero) | Sombre | SVG animé | placeholder HeroViz |
| 12 | HOME-QUISOMMES | `/` — « Qui sommes-nous » | Clair | SVG animé | EcosystemViz (à refondre) |
| 13 | HOME-DIFFERENCE | `/` — « Notre différence » | Clair | SVG animé ou image | mockup CSS générique |
| — | HERO-ACCUEIL | `/` (hero) | Sombre | *conservé* | cosmos (branding) ✅ |
| S1–S6 | APPROCHE-* | 6 pages services — section « Ce que comprend » | Clair | SVG animé (spot) | *optionnel* |

Toutes les tailles de hero : **viewBox `0 0 520 420`** (paysage 5:4). Sections claires : **`0 0 480 400`**. Spots : **`0 0 360 360`**.

---

# HEROS (fond sombre — SVG animé transparent)

### 1. HERO-SERVICES — `/services`
> H1 : « Du conseil à l'IA, appliqués à votre entreprise. » — Métaphore : *tous les leviers, un seul objectif.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (elle sera posée sur un dégradé navy #020B50→#154FB3, donc éléments lumineux/translucides qui fusionnent, avec halo qui déborde).

MÉTAPHORE : une « console d'orchestration » des services. À gauche, un noyau lumineux « Bweb » (bloc arrondi en dégradé bleu #1F6CED → turquoise #12A5C0, léger halo qui respire). De ce noyau partent des FAISCEAUX LUMINEUX courbes (pas des rayons droits) qui vont, de manière ORGANISÉE et décalée dans le temps, alimenter 4 modules-services empilés à droite : une carte « Conseil » (icône cible/boussole), « Formation » (icône livre), « Digitalisation » (icône calques), « Automatisation » (icône engrenage). Chaque module est une carte « verre » translucide avec une fine bordure claire et son icône en trait blanc.

MOUVEMENT : des points lumineux circulent le long des faisceaux du noyau vers les modules, en séquence (Conseil, puis Formation, etc.) ; à l'arrivée, le module concerné s'illumine brièvement (glow) puis se calme ; le noyau pulse doucement ; boucle continue fluide. NE PAS faire une étoile à rayons symétriques : privilégie une composition orchestration/patch-bay horizontale.
Palette : #1F6CED, #12A5C0, blanc translucide. Respecte prefers-reduced-motion.
```

### 2. HERO-CONSEIL — `/services-conseil-strategie`
> H1 : « Une stratégie claire, prête pour l'IA. » — Métaphore : *diagnostiquer, prioriser, tracer la route.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : une FEUILLE DE ROUTE stratégique. Un chemin/tracé sinueux qui traverse l'illustration de gauche à droite, jalonné de 3–4 points d'étape (checkpoints ronds). Au début du chemin, une LOUPE de diagnostic qui survole un petit tableau d'indicateurs (3 mini-barres). À la fin du chemin, une FLÈCHE ROI qui monte vers un petit sommet (drapeau ou pastille de résultat). Le chemin optimal est mis en avant en bleu lumineux ; une variante secondaire, plus faible, suggère les options écartées.

MOUVEMENT : le tracé du chemin se DESSINE progressivement (stroke-dasharray) ; la loupe balaie de gauche à droite au-dessus des indicateurs qui montent ; les checkpoints se valident l'un après l'autre (petit check qui apparaît) ; la flèche ROI grimpe en fin de boucle. Boucle fluide.
Palette : #1F6CED, #154FB3, un accent #8B7CF6 (violet doux). Style trait + verre translucide. Respecte prefers-reduced-motion.
```

### 3. HERO-FORMATION — `/services-formation`
> H1 : « Des équipes autonomes sur l'IA. » — Métaphore : *apprendre en faisant, gagner en autonomie.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : un ATELIER de montée en compétence. Un écran/tableau central « en trait » autour duquel gravitent 2–3 silhouettes simples de personnes (têtes + épaules stylisées) tournées vers l'écran. À droite, un ESCALIER de 3–4 marches ; sur chaque marche, un BADGE de compétence qui se débloque à mesure qu'on monte, jusqu'à une pastille « autonomie » (petite personne + coche) en haut. Une ampoule/idée s'allume au-dessus de l'écran.

MOUVEMENT : les badges se DÉBLOQUENT un par un en montant l'escalier (apparition + petit rebond + glow) ; une barre de progression se remplit ; l'ampoule s'allume par pulsations ; léger flottement des silhouettes. Boucle fluide, chaleureuse.
Palette dominante VERT #00C89E + turquoise #12A5C0, accents blanc translucide. Respecte prefers-reduced-motion.
```

### 4. HERO-DIGITALISATION — `/services-digitalisation`
> H1 : « Des processus clairs, pilotés par la donnée. » — Métaphore : *du désordre au flux numérique piloté.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : une TRANSFORMATION désordre → process. À GAUCHE, quelques fiches/papiers désordonnés, légèrement de travers, ternes. Au CENTRE, un PIPELINE numérique (rail horizontal + 2 engrenages qui tournent + un petit hub CRM) par lequel ces fiches passent et s'ALIGNENT proprement. À DROITE, un mini TABLEAU DE BORD ordonné (colonnes de données + une courbe de productivité qui monte) avec un compteur.

MOUVEMENT : les fiches se déplacent de gauche à droite, se redressent en passant dans le pipeline, les engrenages tournent lentement, la courbe du dashboard grimpe et le compteur de productivité augmente en boucle. Sensation de fluidité, de mise en ordre.
Palette : turquoise #12A5C0 + bleu #1F6CED, blanc translucide. Respecte prefers-reduced-motion.
```

### 5. HERO-SITES-WEB — `/services-creation-sites-web`
> H1 : « Des sites qui servent vos résultats. » — Métaphore : *un site qui se construit et qui convertit.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : un SITE qui se CONSTRUIT et CONVERTIT. Une fenêtre navigateur (barre + 3 pastilles) dont les BLOCS de contenu (header, image, texte, bouton) viennent s'assembler à leur place. À côté, un petit écran MOBILE qui reprend la même mise en page (responsive). En bas, 2 mini-jauges « SEO » et « Performance » qui se remplissent, et une FLÈCHE de conversion qui part d'une icône visiteur vers une icône client (avec un petit + / panier).

MOUVEMENT : les blocs se CLIPSENT en place un à un (glissement + snap) ; un curseur clique le bouton principal ; les jauges se remplissent ; une pulsation de « conversion » circule du visiteur au client en boucle.
Palette : bleu #1F6CED + vert #00C89E, blanc translucide. Respecte prefers-reduced-motion.
```

### 6. HERO-MARKETING — `/services-marketing-digital`
> H1 : « Une visibilité pilotée par la donnée. » — Métaphore : *de la portée à la conversion.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : PORTÉE → CONVERSION. À gauche, un MÉGAPHONE (en trait) d'où partent des ONDES concentriques qui se propagent vers une AUDIENCE : une grappe de petites pastilles-avatars qui s'illuminent quand l'onde les atteint et se multiplient (audience qui grandit). À droite, un ENTONNOIR qui reçoit ces vues et laisse tomber en bas quelques pastilles « client » (avec coche), à côté d'une petite courbe d'engagement qui monte.

MOUVEMENT : les ondes émanent du mégaphone en boucle ; les avatars s'allument en cascade ; l'entonnoir « filtre » et fait tomber des clients ; la courbe grimpe. Énergie positive.
Palette CHAUDE dominante : orange #FF835F + jaune #E0A400, avec un rappel bleu #1F6CED. Blanc translucide. Respecte prefers-reduced-motion.
```

### 7. HERO-AUTOMATISATION — `/services-automatisation-ia`
> H1 : « L'IA au service de votre productivité. » — Métaphore : *au‑delà de WhatsApp, l'IA travaille pour vous.* *(remplace le mockup de chat actuel)*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : un WORKFLOW d'automatisation autonome. Un CIRCUIT/RAIL en boucle (forme arrondie type piste) le long duquel circulent des JETONS de tâches. Sur le circuit : un déclencheur (petit éclair/entrée), puis un NŒUD IA central (bloc en dégradé bleu→violet, cerveau/puce en trait, léger halo), puis 3 sorties d'ACTIONS représentées par des icônes en trait : une réponse (bulle), une relance (enveloppe/flèche), un suivi prospect (courbe/contact). À côté, une petite HORLOGE avec un compteur « temps gagné ».

MOUVEMENT : les jetons circulent en continu le long du rail (déclencheur → IA → actions → retour), le nœud IA pulse à chaque passage, les icônes d'action clignotent doucement à réception, l'aiguille de l'horloge avance et le compteur d'heures gagnées augmente. IMPORTANT : ne PAS se limiter à une conversation de chat/WhatsApp — montrer plusieurs types de tâches automatisées.
Palette : violet #8B7CF6 + bleu #1F6CED, blanc translucide. Respecte prefers-reduced-motion.
```

### 8. HERO-APROPOS — `/a-propos`
> H1 : « Rendre l'IA utile aux entreprises. » — Métaphore : *partenaire humain, ancré en Afrique, propulsé par l'IA.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : un PARTENAIRE humain + ancrage africain + IA. Au centre, un NOYAU lumineux « Bweb » (pastille en dégradé bleu→vert avec un petit halo qui respire). Autour, 2–3 silhouettes de personnes stylisées et une POIGNÉE DE MAIN en trait (dimension humaine/accompagnement). En fond, très discret, un contour stylisé de la CÔTE D'IVOIRE / de l'Afrique fait de points reliés (réseau), avec une trajectoire de croissance (flèche douce qui monte).

MOUVEMENT : les points du contour Afrique se relient progressivement (réseau qui se tisse) ; le noyau Bweb pulse ; la poignée de main émet une petite onde chaleureuse ; la trajectoire de croissance se dessine. Ton chaleureux, humain, NON cosmique.
Palette : bleu #1F6CED + vert #00C89E, blanc translucide. Respecte prefers-reduced-motion.
```

### 9. HERO-FORMATIONS — `/formations`
> H1 : « Montez en compétence sur l'IA. » — Métaphore : *une bibliothèque de compétences, présentiel + en ligne.* *(à différencier du hero « service formation » n°3)*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : un CATALOGUE / PARCOURS d'apprentissage. Un ÉVENTAIL de cartes-modules thématiques (5–7 cartes « verre » translucides légèrement décalées, chacune avec une petite icône différente : IA, marketing, data, vente, design…). Au premier plan, deux repères qui symbolisent les deux modes : une SALLE (présentiel : petit tableau + personne) et un ÉCRAN (en ligne : fenêtre de cours). Une TOQUE de diplômé posée sur l'ensemble.

MOUVEMENT : les cartes de l'éventail se déploient/se recomposent en douceur (fan-out en boucle), l'une passe légèrement au premier plan à tour de rôle et s'illumine, la toque scintille doucement. Sensation de richesse de l'offre.
Palette : vert #00C89E + bleu #1F6CED, blanc translucide. Respecte prefers-reduced-motion.
```

### 10. HERO-METHODOLOGIE — `/methodologie`
> H1 : « Des objectifs aux résultats, sans détour. » — Métaphore : *un chemin balisé, objectif → résultat.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : un CHEMIN BALISÉ, droit au but. Un tracé clair (légèrement en escalier ascendant) qui part, à gauche, d'un DRAPEAU « objectif » et arrive, à droite, à un TROPHÉE ou un petit GRAPHE « résultats » qui monte. Le long du chemin, 4–5 CHECKPOINTS numérotés qui se valident (Diagnostic → Cadrage → Déploiement → Formation → Suivi), avec de petits engrenages/flux entre eux.

MOUVEMENT : le tracé se dessine de l'objectif au résultat, les checkpoints se valident en séquence (coche + glow), un point lumineux progresse le long du chemin, le trophée/graphe s'illumine à l'arrivée, puis boucle. Sensation de rigueur et de progression sans détour.
Palette : turquoise #12A5C0 + accent violet #8B7CF6, blanc translucide. Respecte prefers-reduced-motion.
```

### 11. HERO-REALISATIONS — `/realisations`
> H1 : « Des projets tournés vers les résultats. » — Métaphore : *un portfolio qui prouve l'impact.*

```
Illustration SVG animée, viewBox 0 0 520 420, FOND SOMBRE (éléments lumineux translucides, halo qui déborde).

MÉTAPHORE : un MUR de projets + IMPACT mesuré. Un empilement/mosaïque de 4–5 MINI-ÉCRANS de projets (cartes « verre » translucides évoquant un dashboard, un site e-commerce, une appli, un chat) légèrement en profondeur. Devant, 2–3 MÉTRIQUES qui montent : un compteur « % satisfaction », une petite courbe de résultats, un badge de secteurs. Éviter les étoiles de notation (préférer une jauge/coche de satisfaction).

MOUVEMENT : les mini-écrans apparaissent/glissent en cascade et flottent légèrement en parallaxe ; les compteurs s'incrémentent ; la courbe grimpe ; un écran passe au premier plan à tour de rôle et s'illumine. Boucle fluide.
Palette : bleu #1F6CED + accent jaune #E0A400, blanc translucide. Respecte prefers-reduced-motion.
```

---

# SECTIONS CLAIRES (SVG animé — fond clair)

### 12. HOME-QUISOMMES — `/` · « Qui sommes-nous »
> H2 : « Le partenaire IA des entreprises qui veulent avancer plus vite. » — Fond CLAIR.

```
Illustration SVG animée, viewBox 0 0 480 400, FOND CLAIR (posée sur un panneau blanc/bleu très pâle #eef3ff). Traits et éléments en navy #020B50 / bleu #1F6CED, PAS de style « verre sur fond sombre ».

MÉTAPHORE : l'IA au CŒUR de l'organisation qui IRRIGUE les fonctions clés. Un cœur/noyau « Bweb IA » central (pastille en dégradé bleu #1F6CED → turquoise #12A5C0) relié à 5 fonctions d'entreprise disposées autour : Équipes, Décisions, Données, Process, Croissance (chacune une carte claire avec icône en trait + un mini-KPI, ex. une petite barre ou un chiffre). Des FLUX de données lumineux circulent du noyau vers chaque fonction.

MOUVEMENT : des points de données circulent le long des liens (noyau → fonctions) ; sur chaque fonction, le mini-KPI progresse un peu (barre qui monte) ; le noyau pulse doucement. Propre, corporate, lisible sur fond clair.
Palette : bleu #1F6CED, turquoise #12A5C0, vert #00C89E, navy #020B50 pour les traits. Respecte prefers-reduced-motion.
```

### 13. HOME-DIFFERENCE — `/` · « Notre différence »
> H2 : « Nous ne proposons pas seulement des outils. Nous construisons des solutions utiles. » — Fond CLAIR. *(remplace le faux dashboard générique)*

```
Illustration SVG animée, viewBox 0 0 480 400, FOND CLAIR (panneau blanc/bleu pâle). Traits navy #020B50 / bleu #1F6CED.

MÉTAPHORE : des OUTILS épars qui S'ASSEMBLENT en UNE solution utile. À gauche/au début, plusieurs icônes-outils séparées et un peu désordonnées (engrenage, graphe, message, base de données, site). Elles se rapprochent et se CLIPSENT ensemble pour former, à droite, un TABLEAU DE BORD unifié et ordonné, surmonté d'une COURBE DE RÉSULTATS qui grimpe (valeur/utilité).

MOUVEMENT : les icônes-outils convergent et s'emboîtent une à une (glissement + snap léger) pour composer le dashboard ; une fois assemblé, la courbe de résultats monte et un petit indicateur « + » pulse. Métaphore claire « outils → solution utile ».
Palette : bleu #1F6CED, vert #00C89E (courbe positive), navy pour les traits. Respecte prefers-reduced-motion.

[Alternative possible : si tu préfères un rendu plus illustratif, écris « FORMAT IMAGE » — génère une illustration vectorielle plate 16:10, mêmes métaphore et palette.]
```

---

# SPOTS SECONDAIRES — sections « Ce que comprend ce service » *(optionnel)*

Ces 6 sections sont aujourd'hui de simples cartes à cocher (fond clair). Petit spot‑illustration facultatif, **viewBox `0 0 360 360`, fond clair, traits navy/bleu**. Même bloc de specs, en remplaçant juste la métaphore :

| ID | Page | Métaphore du spot |
|---|---|---|
| S1 APPROCHE-CONSEIL | `/services-conseil-strategie` | Une loupe qui analyse un tableau d'indicateurs, puis trace une flèche de plan d'action. |
| S2 APPROCHE-FORMATION | `/services-formation` | Une graine/plante de savoir qui pousse avec des étincelles IA au fil de la pratique. |
| S3 APPROCHE-DIGITALISATION | `/services-digitalisation` | Des fiches clients qui s'ordonnent dans un CRM, avec un compteur de productivité. |
| S4 APPROCHE-SITES-WEB | `/services-creation-sites-web` | Une fenêtre navigateur + un mobile avec un layout modulable et un compteur de vitesse. |
| S5 APPROCHE-MARKETING | `/services-marketing-digital` | Un calendrier de contenus dont les posts gagnent des likes/reach, flèche de croissance. |
| S6 APPROCHE-AUTOMATISATION | `/services-automatisation-ia` | Un tapis roulant de tâches automatisées avec un compteur d'heures gagnées. |

Prompt type à coller (adapter la métaphore) :
```
Spot-illustration SVG animée, viewBox 0 0 360 360, FOND CLAIR (traits navy #020B50 / bleu #1F6CED). Métaphore : [COLLER LA MÉTAPHORE DU TABLEAU]. Mouvement subtil en boucle (dessin/pulsation/compteur). Palette de marque, respecte prefers-reduced-motion. Renvoie uniquement le SVG.
```

---

# Accueil — hero cosmique *(conservé)*

**HERO-ACCUEIL** (`/`) est l'**identité de marque** : champ d'étoiles + astres en orbite + étoile‑IA à 4 branches. **On le garde** — c'est le seul endroit « cosmique » (avec le logo). Aucun nouveau prompt nécessaire. *(Si tu veux plus tard le renforcer, on ajuste directement le code — pas besoin de ChatGPT.)*

---

# Slots PHOTO / CAPTURE / CARTE — *pas d'illustration générée*

À alimenter avec du **vrai contenu**, pas de la génération décorative :

| Emplacement | Page | À fournir |
|---|---|---|
| Portrait fondateur (Godwin Soola) | `/a-propos` | Photo réelle (ou portrait duotone bleu). |
| Équipe (3–4 membres) | `/a-propos` | Photos réelles des membres. |
| Vignettes portfolio (accueil ×3, réalisations ×6) | `/`, `/realisations` | Vraies captures d'écran des projets. |
| Zoom ACOPCI & Ivoire 2C | `/realisations` | Captures/écrans des projets concernés. |
| Carte de localisation | `/contact` | Intégration Google Maps (pas une illustration). |

> Besoin de placeholders en attendant ? Je peux générer des mockups d'écran neutres, ou tu peux demander à ChatGPT une image (« FORMAT IMAGE ») de type capture stylisée.

---

## Après génération

Envoie‑moi le SVG (ou l'image) obtenu pour chaque illustration : **je l'intègre à la bonne page**, je remplace le placeholder, je vérifie qu'il fusionne bien dans le hero et qu'il reste responsive + accessible (reduced-motion). On avance **slot par slot**.
