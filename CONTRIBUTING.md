# Guide de contribution — Site Bweb Agence

Ce document décrit comment travailler à plusieurs sur ce dépôt sans jamais casser la
production. **Lis-le avant ton premier commit.**

---

## 1. Règle d'or

> **On ne pousse jamais directement sur `main`.**
> `main` est déployé automatiquement en production par Vercel. Toute modification passe
> par une **branche** puis une **Pull Request (PR)**.

---

## 2. Mise en route (une seule fois)

```bash
git clone https://github.com/bweb-agence/Bweb-site-web.git
cd Bweb-site-web

cp .env.example .env      # puis colle les vraies clés (voir §5)
nvm use                   # Node 24 (voir .nvmrc)
npm install
npm run dev               # http://localhost:4321
```

Scripts disponibles :

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev local (hot reload) |
| `npm run build` | Génère le site statique dans `dist/` |
| `npm run preview` | Prévisualise le build de production en local |

---

## 3. Le cycle de travail

```bash
# 1. Partir d'un main à jour
git checkout main
git pull

# 2. Créer UNE branche par tâche
git checkout -b fix/formulaire-contact

# 3. Coder + tester en local
npm run dev

# 4. Commiter et pousser
git add -A
git commit -m "fix: corrige l'envoi du formulaire de contact"
git push -u origin fix/formulaire-contact

# 5. Ouvrir une Pull Request vers main sur GitHub
```

Dès que la PR est ouverte, **Vercel génère automatiquement une preview** (URL de test
unique) : on relit le code + on vérifie la preview, puis on merge. Le merge dans `main`
déclenche le déploiement en production.

### Convention de nommage des branches

| Préfixe | Usage |
|---|---|
| `feat/` | Nouvelle fonctionnalité |
| `fix/` | Correction de bug |
| `chore/` | Maintenance, config, dépendances |
| `refonte/` | Gros chantier / refactor |

Une branche = une tâche. On évite les branches personnelles permanentes : on crée une
branche par sujet, et on la supprime après le merge.

---

## 4. Messages de commit

Format court et parlant, en préfixant par le type :

```
feat: ajoute la page tarifs
fix: corrige le scroll du hero sur mobile
chore: met à jour Astro en 7.x
```

---

## 5. Gestion des modifications locales et des secrets

**Ce qui est versionné (partagé via Git) :** tout le code (`src/`, `public/`,
config, styles) **et** `.env.example`.

**Ce qui reste local à chaque machine (jamais commité) :**

| Élément | Pourquoi |
|---|---|
| `.env` | Contient les **secrets** (Supabase service role, clé Bird). Déjà dans `.gitignore`. |
| `node_modules/` | Régénéré par `npm install` |
| `dist/`, `.astro/`, `.vercel` | Artefacts de build, régénérés localement |

Chaque dev a **sa propre copie de `.env`** sur sa machine. On ne partage jamais les
vraies clés via Git : elles se transmettent hors dépôt (gestionnaire de mots de passe,
message privé). Le modèle à copier est `.env.example`.

Les mêmes variables doivent exister côté serveur dans
**Vercel → Settings → Environment Variables** (sinon le build casse). Voir aussi le
`README.md` pour la liste des variables requises.

> ⚠️ Si tu ajoutes une nouvelle variable d'environnement, mets à jour **`.env.example`**
> (avec une valeur bidon) **et** ajoute la vraie valeur dans Vercel.

---

## 6. Avant d'ouvrir une PR — checklist

- [ ] `npm run build` passe sans erreur en local
- [ ] Testé en local (`npm run dev` ou `npm run preview`)
- [ ] Aucun secret ni fichier `.env` dans le commit
- [ ] La branche part d'un `main` à jour

---

## 7. Résumé

```
   ta machine                  GitHub                    Vercel
   ----------                  ------                    ------
   branche + .env local  ──►   Pull Request      ──►     Preview (test)
                               review + merge    ──►     Production (main)
```

Le code voyage par Git. Les secrets, eux, ne quittent jamais ta machine ni Vercel.
