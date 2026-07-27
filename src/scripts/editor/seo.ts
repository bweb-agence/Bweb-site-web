/* =========================================================
   BWEB — Analyse SEO d'un article (façon Yoast/RankMath).
   Prend le contenu + les métadonnées, renvoie un score /100
   et une checklist de bonnes pratiques (ok / warn / bad).
   ========================================================= */
export type SeoStatus = "ok" | "warn" | "bad";
export type SeoCheck = { status: SeoStatus; label: string };
export type SeoResult = { score: number; grade: SeoStatus; checks: SeoCheck[] };

export type SeoInput = {
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  html: string;
  focusKeyword: string;
  coverUrl: string;
};

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const stripHtml = (html: string) =>
  (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function analyzeSeo(i: SeoInput): SeoResult {
  const checks: SeoCheck[] = [];
  const add = (status: SeoStatus, label: string) => checks.push({ status, label });

  const kw = norm(i.focusKeyword).trim();
  const hasKw = kw.length > 0;
  const text = stripHtml(i.html);
  const nText = norm(text);
  const words = text ? text.split(/\s+/).length : 0;
  const seoTitle = (i.metaTitle || i.title || "").trim();
  const metaDesc = (i.metaDescription || i.excerpt || "").trim();

  // Titres du corps
  const hLevels = [...i.html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  const h1Count = hLevels.filter((l) => l === 1).length;
  const subheads = hLevels.filter((l) => l >= 2).length;
  const firstPara = norm(stripHtml((i.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || ""));
  const headingText = norm([...i.html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi)].map((m) => m[1]).join(" "));

  // Images / liens / alt
  const imgs = [...i.html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const imgsNoAlt = imgs.filter((t) => !/\balt\s*=\s*["'][^"']+["']/i.test(t)).length;
  const links = (i.html.match(/<a\b[^>]*href/gi) || []).length;

  // --- Mot-clé cible ---
  if (!hasKw) {
    add("bad", "Définissez un mot-clé cible pour lancer l'analyse.");
  } else {
    add(norm(seoTitle).includes(kw) ? "ok" : "bad",
      norm(seoTitle).includes(kw) ? "Le mot-clé est dans le titre." : "Ajoutez le mot-clé dans le titre.");
    add(norm(metaDesc).includes(kw) ? "ok" : "warn",
      norm(metaDesc).includes(kw) ? "Le mot-clé est dans la description méta." : "Ajoutez le mot-clé dans la description méta.");
    add(norm(i.slug).includes(kw.replace(/\s+/g, "-")) || norm(i.slug).includes(kw.replace(/\s+/g, "")) ? "ok" : "warn",
      "Le mot-clé apparaît dans l'URL (slug).");
    add(firstPara.includes(kw) ? "ok" : "warn",
      firstPara.includes(kw) ? "Le mot-clé apparaît dès l'introduction." : "Placez le mot-clé dans le 1er paragraphe.");
    add(headingText.includes(kw) ? "ok" : "warn",
      headingText.includes(kw) ? "Le mot-clé apparaît dans un sous-titre." : "Utilisez le mot-clé dans un sous-titre.");
    // Densité
    const occ = hasKw ? (nText.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length : 0;
    const density = words ? (occ / words) * 100 : 0;
    if (occ === 0) add("bad", "Le mot-clé n'apparaît pas dans le contenu.");
    else if (density > 3) add("warn", `Densité du mot-clé trop élevée (${density.toFixed(1)} %).`);
    else if (density < 0.4) add("warn", `Densité du mot-clé faible (${density.toFixed(1)} %).`);
    else add("ok", `Densité du mot-clé optimale (${density.toFixed(1)} %).`);
  }

  // --- Titre méta ---
  const tl = seoTitle.length;
  if (tl === 0) add("bad", "Le titre méta est vide.");
  else if (tl < 30) add("warn", `Titre méta un peu court (${tl} car.).`);
  else if (tl > 60) add("warn", `Titre méta trop long (${tl} car., idéal ≤ 60).`);
  else add("ok", `Longueur du titre méta idéale (${tl} car.).`);

  // --- Description méta ---
  const dl = metaDesc.length;
  if (dl === 0) add("bad", "Ajoutez une description méta.");
  else if (dl < 120) add("warn", `Description méta courte (${dl} car., idéal 120–156).`);
  else if (dl > 160) add("warn", `Description méta trop longue (${dl} car.).`);
  else add("ok", `Longueur de la description méta idéale (${dl} car.).`);

  // --- Contenu ---
  if (words < 300) add(words < 150 ? "bad" : "warn", `Contenu court (${words} mots, visez ≥ 300).`);
  else add("ok", `Longueur du contenu suffisante (${words} mots).`);

  add(subheads > 0 ? "ok" : "warn",
    subheads > 0 ? `Structure avec ${subheads} sous-titre(s).` : "Ajoutez des sous-titres (Titre 2/3).");

  if (h1Count > 0) add("warn", "Évitez les Titres 1 dans le corps (réservés au titre de l'article).");

  add(imgs.length > 0 ? "ok" : "warn",
    imgs.length > 0 ? `${imgs.length} image(s) dans le contenu.` : "Ajoutez au moins une image.");
  if (imgsNoAlt > 0) add("warn", `${imgsNoAlt} image(s) sans texte alternatif (alt).`);

  add(i.coverUrl ? "ok" : "warn", i.coverUrl ? "Image de couverture définie." : "Ajoutez une image de couverture.");
  add(links > 0 ? "ok" : "warn", links > 0 ? `${links} lien(s) dans le contenu.` : "Ajoutez un lien (interne ou externe).");

  // --- Score ---
  const total = checks.length;
  const good = checks.filter((c) => c.status === "ok").length;
  const bad = checks.filter((c) => c.status === "bad").length;
  const score = total ? Math.round(((good + (total - good - bad) * 0.5) / total) * 100) : 0;
  const grade: SeoStatus = score >= 80 ? "ok" : score >= 55 ? "warn" : "bad";

  // Tri : problèmes d'abord
  const order = { bad: 0, warn: 1, ok: 2 };
  checks.sort((a, b) => order[a.status] - order[b.status]);

  return { score, grade, checks };
}
