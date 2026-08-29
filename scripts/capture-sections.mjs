#!/usr/bin/env node
/* =========================================================
   Captures SECTION PAR SECTION d'une page
   -----------------------------------------------------------
   Une capture pleine page ne se valide pas : sur une page de vente, elle fait
   3 000 pixels de haut, tout y est minuscule et personne ne voit la faute de
   ponctuation du bloc 7. On découpe donc, une image par section, à la largeur
   demandée — c'est ce qui permet un GO section par section.

   S'appuie sur le navigateur partagé de gstack (`browse`) : pas de second
   Chromium à installer, pas de version à faire dériver.

   Usage :
     node scripts/capture-sections.mjs <url> [--out <dossier>] [--width 1440]
                                             [--selector <css>] [--scale 1]

   `--selector` peut être répété ; par défaut on découpe toutes les
   `<section>` de <main>, dans l'ordre de la page.
   ========================================================= */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const BROWSE = [
  join(process.cwd(), ".claude/skills/gstack/browse/dist/browse"),
  join(homedir(), ".claude/skills/gstack/browse/dist/browse"),
].find(existsSync);

if (!BROWSE) {
  console.error("browse introuvable — installer gstack (~/.claude/skills/gstack) puis relancer.");
  process.exit(1);
}

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
if (!url) {
  console.error("Usage : node scripts/capture-sections.mjs <url> [--out dossier] [--width 1440]");
  process.exit(1);
}
const flag = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaut;
};
const flags = (nom) =>
  args.reduce((acc, a, i) => (a === `--${nom}` && args[i + 1] ? [...acc, args[i + 1]] : acc), []);

const out = resolve(flag("out", "captures"));
const width = flag("width", "1440");
const scale = flag("scale", "1");
mkdirSync(out, { recursive: true });

const browse = (...cmd) => execFileSync(BROWSE, cmd, { encoding: "utf8" }).trim();

browse("viewport", `${width}x900`, "--scale", scale);
browse("goto", url);

/* On masque ce qui flotte AU-DESSUS de la page : bannière de consentement,
   bouton WhatsApp, scroll-spy latéral. Ce ne sont pas des défauts de la
   section, mais ils se retrouvent dans chaque capture et font discuter de
   la mauvaise chose pendant la validation. */
browse(
  "js",
  `(() => { const s = document.createElement('style');
    s.textContent = '#cc-main, .wa-float, .section-nav, .at-sticky { display: none !important; }';
    document.head.appendChild(s); return 'ok'; })()`,
);

/* Les sections apparaissent au défilement (révélations GSAP). Sans ce
   parcours, la moitié des captures sortiraient vides — c'est le piège
   classique d'un script de capture sur ce site. */
browse("js", "window.scrollTo(0, document.body.scrollHeight)");
browse("js", "new Promise(r => setTimeout(r, 2500))");
browse("js", "window.scrollTo(0, 0)");

const selectors = flags("selector");
const cibles = selectors.length
  ? selectors.map((sel, i) => ({ sel, nom: `${String(i + 1).padStart(2, "0")}-${sel.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}` }))
  : JSON.parse(
      browse(
        "js",
        `JSON.stringify(Array.from(document.querySelectorAll('main > section')).map((s, i) => ({
          sel: '#' + (s.id || (s.id = 'cap-' + i)),
          nom: String(i + 1).padStart(2, '0') + '-' + ((s.dataset.navSection || s.className.split(' ')[0] || 'section')
            .toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
        })))`,
      ),
    );

console.log(`${cibles.length} section(s) · ${width}px · → ${out}\n`);
for (const { sel, nom } of cibles) {
  const fichier = join(out, `${nom}.png`);
  browse("scroll", sel);
  browse("js", "new Promise(r => setTimeout(r, 400))");
  browse("screenshot", fichier, "--selector", sel);
  console.log(`  ✓ ${nom}.png`);
}
