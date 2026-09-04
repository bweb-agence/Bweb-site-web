#!/usr/bin/env node
/**
 * Optimise les images de public/images/ : conversion en WebP à la taille
 * réellement utile, mise à jour des références dans le code, archivage des
 * sources hors production.
 *
 *   npm run visuels              # convertit
 *   npm run visuels -- --dry-run # simule, n'écrit rien
 *
 * Pourquoi : une photo de 1,8 Mo affichée en 96 px coûte cher à un visiteur
 * en 4G ivoirienne. Le WebP à la bonne largeur divise le poids par 20 à 50
 * sans différence visible.
 *
 * ATTENTION — certaines images ne DOIVENT PAS devenir du WebP :
 *  - l'image og:image : Facebook, WhatsApp et LinkedIn ne l'affichent pas
 *    en aperçu de partage ;
 *  - les images d'e-mail : Outlook ne sait pas lire le WebP.
 * Ces cas sont détectés automatiquement (voir estExclu) et laissés intacts.
 */
import { readdir, mkdir, rename, stat, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, dirname, basename, extname } from "node:path";
import sharp from "sharp";

const IMAGES_DIR = "public/images";
const SOURCE_DIR = "visuels-sources";
const CODE_DIRS = ["src"];
const CODE_EXT = new Set([".astro", ".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".json"]);
const CONVERTIBLES = new Set([".png", ".jpg", ".jpeg"]);
const DRY_RUN = process.argv.includes("--dry-run");

/* Largeur cible = taille d'affichage max × 2 (écrans Retina).
   Le premier motif qui correspond gagne ; sinon PROFIL_DEFAUT. */
const PROFILS = [
  { motif: /parcours-initiation\/bonus-\d+\./, largeur: 192, qualite: 92, usage: "icône bonus (64 px)" },
  { motif: /parcours-initiation\/phase-\d+\./, largeur: 640, qualite: 88, usage: "visuel de phase (300 px)" },
  { motif: /parcours-initiation\/(glass|hero)-/, largeur: 1400, qualite: 84, usage: "visuel de section" },
  { motif: /parcours-initiation\/godwin-portrait\./, largeur: 720, qualite: 86, usage: "portrait (360 px)" },
  { motif: /parcours-initiation\/certificat-/, largeur: 1200, qualite: 88, usage: "certificat (560 px, texte fin à préserver)" },
  { motif: /\/(godwin-soola|ops-manager|media-buyer|closer-senior|content-creator|tech-manager|sdr-closer2)/, largeur: 800, qualite: 82, usage: "avatar équipe (96 px + lightbox)" },
  { motif: /\/mission-/, largeur: 1400, qualite: 84, usage: "photo Mission & vision" },
  { motif: /\/salle\//, largeur: 1600, qualite: 82, usage: "galerie salle (pleine largeur)" },
];
const PROFIL_DEFAUT = { largeur: 1600, qualite: 84, usage: "image de contenu (défaut)" };

const ko = (o) => Math.round(o / 1024) + " Ko";

/* ---------- Lecture du code, une seule fois ---------- */
async function fichiersCode(dir, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await fichiersCode(p, acc);
    else if (CODE_EXT.has(extname(e.name))) acc.push(p);
  }
  return acc;
}

async function imagesDe(dir, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await imagesDe(p, acc);
    else if (CONVERTIBLES.has(extname(e.name).toLowerCase())) acc.push(p);
  }
  return acc;
}

/* ---------- Exclusions : formats que WebP casserait ---------- */
function estExclu(cheminWeb, sources) {
  const nom = basename(cheminWeb);

  // Aperçus de partage social : WebP non supporté par Facebook / WhatsApp / LinkedIn
  // Le troisième motif couvre la prop `image=` des layouts, par laquelle une
  // page passe SON aperçu de partage : sans lui, une og:image déclarée de
  // cette façon était convertie en WebP et l'aperçu WhatsApp devenait vide.
  const enOg = sources.some(
    ({ contenu }) =>
      new RegExp(`ogImage\\s*:\\s*["'\`][^"'\`]*${nom}`).test(contenu) ||
      new RegExp(`og:image[^>]*${nom}`).test(contenu) ||
      new RegExp(`\\bimage\\s*=\\s*["'\`{][^"'\`]*${nom}`).test(contenu),
  );
  if (enOg) return "image de partage social (og:image) — WebP non supporté par les réseaux";

  // E-mails : Outlook ne lit pas le WebP
  const enEmail = sources.some(
    ({ chemin, contenu }) => /email|mailer|newsletter/i.test(chemin) && contenu.includes(nom),
  );
  if (enEmail) return "utilisée dans un e-mail — WebP non supporté par Outlook";

  if (/^(favicon|apple-touch-icon)/.test(nom)) return "favicon — doit rester au format d'origine";

  return null;
}

/* ---------- Programme ---------- */
if (!existsSync(IMAGES_DIR)) {
  console.log(`Dossier ${IMAGES_DIR} introuvable.`);
  process.exit(0);
}

const sources = [];
for (const dir of CODE_DIRS) {
  if (!existsSync(dir)) continue;
  for (const chemin of await fichiersCode(dir)) {
    sources.push({ chemin, contenu: await readFile(chemin, "utf8") });
  }
}

const images = await imagesDe(IMAGES_DIR);
if (!images.length) {
  console.log(`Aucune image à optimiser dans ${IMAGES_DIR}/`);
  process.exit(0);
}

console.log(DRY_RUN ? "SIMULATION — aucun fichier ne sera modifié\n" : "");

let avant = 0;
let apres = 0;
const convertis = [];
const ignores = [];

for (const src of images.sort()) {
  const cheminWeb = "/" + relative("public", src).split("\\").join("/");
  const raison = estExclu(cheminWeb, sources);
  if (raison) {
    ignores.push({ cheminWeb, raison });
    continue;
  }

  const profil = PROFILS.find((p) => p.motif.test(cheminWeb)) ?? PROFIL_DEFAUT;
  const dst = src.slice(0, -extname(src).length) + ".webp";

  if (existsSync(dst)) {
    ignores.push({ cheminWeb, raison: "un .webp existe déjà" });
    continue;
  }

  const tailleSrc = (await stat(src)).size;
  let tailleDst = 0;

  if (!DRY_RUN) {
    await sharp(src)
      .resize({ width: profil.largeur, withoutEnlargement: true })
      .webp({ quality: profil.qualite, effort: 6 })
      .toFile(dst);
    tailleDst = (await stat(dst)).size;
  }

  avant += tailleSrc;
  apres += tailleDst;
  convertis.push({ src, dst, cheminWeb, profil, tailleSrc, tailleDst });
  console.log(
    `✓ ${cheminWeb}  ${ko(tailleSrc)}${DRY_RUN ? "" : ` → ${ko(tailleDst)}`}  (${profil.usage})`,
  );
}

/* ---------- Mise à jour des références puis archivage des sources ----------
   L'ordre compte : si une référence n'est pas réécrite, l'image disparaît du
   site. On réécrit d'abord, on vérifie, on archive seulement ensuite. */
if (convertis.length && !DRY_RUN) {
  let fichiersTouches = 0;
  for (const { chemin, contenu } of sources) {
    let maj = contenu;
    for (const { src } of convertis) {
      const ancien = basename(src);
      const nouveau = basename(src, extname(src)) + ".webp";
      maj = maj.split(ancien).join(nouveau);
    }
    if (maj !== contenu) {
      await writeFile(chemin, maj, "utf8");
      fichiersTouches++;
    }
  }
  console.log(`\n${fichiersTouches} fichier(s) de code mis à jour.`);

  // Garde-fou : aucune référence à l'ancien nom ne doit subsister
  const orphelines = [];
  for (const { chemin } of sources) {
    const contenu = await readFile(chemin, "utf8");
    for (const { src } of convertis) {
      if (contenu.includes(basename(src))) orphelines.push(`${chemin} → ${basename(src)}`);
    }
  }
  if (orphelines.length) {
    console.error("\n⛔ Références non réécrites, archivage annulé :");
    orphelines.forEach((o) => console.error("   " + o));
    process.exit(1);
  }

  for (const { src } of convertis) {
    const dest = join(SOURCE_DIR, relative("public", src));
    await mkdir(dirname(dest), { recursive: true });
    await rename(src, dest);
  }
  console.log(`Sources archivées dans ${SOURCE_DIR}/ (hors production).`);
}

/* ---------- Résumé ---------- */
if (ignores.length) {
  console.log("\nLaissées intactes :");
  for (const { cheminWeb, raison } of ignores) console.log(`  · ${cheminWeb} — ${raison}`);
}
if (convertis.length) {
  console.log(
    DRY_RUN
      ? `\n${convertis.length} image(s) à convertir, ${ko(avant)} concernés.`
      : `\nTotal publié : ${ko(avant)} → ${ko(apres)} (−${Math.round((1 - apres / avant) * 100)} %).`,
  );
} else {
  console.log("\nRien à convertir : tout est déjà optimisé.");
}
