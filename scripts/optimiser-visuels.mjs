#!/usr/bin/env node
/**
 * Optimise les visuels de la page Parcours Initiation.
 *
 * Workflow : générer le visuel dans Codex → déposer le PNG dans
 * public/images/parcours-initiation/ → `npm run visuels`.
 *
 * Le script produit un .webp dimensionné pour son usage réel (les icônes
 * bonus s'affichent à 64 px, inutile d'embarquer du 1254 px), puis déplace
 * le PNG source dans visuels-sources/ pour qu'il ne parte pas en production.
 * La page préfère automatiquement le .webp au .png.
 */
import { readdir, mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = "public/images/parcours-initiation";
const SOURCE_DIR = "visuels-sources/parcours-initiation";

/* Largeur cible par famille de visuel = taille d'affichage × 2 (écrans Retina). */
const PROFILS = [
  { motif: /^phase-\d+\.png$/, largeur: 640, qualite: 88, usage: "visuel de phase (300 px)" },
  { motif: /^bonus-\d+\.png$/, largeur: 192, qualite: 92, usage: "icône bonus (64 px)" },
  { motif: /^godwin-portrait\.png$/, largeur: 720, qualite: 86, usage: "portrait (360 px)" },
  { motif: /^hero-.*\.png$/, largeur: 1400, qualite: 82, usage: "couverture hero" },
];

const ko = (o) => Math.round(o / 1024) + " Ko";

const fichiers = (await readdir(PUBLIC_DIR)).filter((f) => f.endsWith(".png"));
if (!fichiers.length) {
  console.log("Aucun PNG à optimiser dans " + PUBLIC_DIR);
  process.exit(0);
}

await mkdir(SOURCE_DIR, { recursive: true });
let avant = 0;
let apres = 0;

for (const fichier of fichiers) {
  const profil = PROFILS.find((p) => p.motif.test(fichier));
  if (!profil) {
    console.log(`⏭  ${fichier} — aucun profil connu, ignoré`);
    continue;
  }
  const src = join(PUBLIC_DIR, fichier);
  const dst = join(PUBLIC_DIR, fichier.replace(/\.png$/, ".webp"));

  await sharp(src)
    .resize({ width: profil.largeur, withoutEnlargement: true })
    .webp({ quality: profil.qualite, effort: 6 })
    .toFile(dst);

  const tailleSrc = (await stat(src)).size;
  const tailleDst = (await stat(dst)).size;
  avant += tailleSrc;
  apres += tailleDst;

  await rename(src, join(SOURCE_DIR, fichier));
  console.log(`✓ ${fichier} → ${ko(tailleSrc)} → ${ko(tailleDst)}  (${profil.usage})`);
}

console.log(`\nTotal publié : ${ko(avant)} → ${ko(apres)}`);
console.log(`PNG sources archivés dans ${SOURCE_DIR}/ (hors production).`);
