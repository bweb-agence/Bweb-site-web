/* =========================================================
   Helpers de formatage partagés (blog, calendrier, réservation).
   ========================================================= */

/** Date longue en français : « 24 juillet 2026 ». */
export function frDateLong(d: string | Date): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Date courte : « 24 juil. 2026 ». */
export function frDateShort(d: string | Date): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Heure : « 9h00 ». */
export function frTime(d: string | Date): string {
  return new Date(d)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .replace(":", "h");
}

/** Prix en FCFA : « 56 000 F CFA ». */
export function priceFCFA(n: number): string {
  return `${n.toLocaleString("fr-FR")} F CFA`;
}

/** Table de correspondance nom de thème (minuscule) -> couleur, issue de la table `themes`. */
export type ThemeColorMap = Record<string, string>;

/** Classe de dégradé de couverture (blog) selon la catégorie/thème. */
export function coverClass(category?: string | null, map?: ThemeColorMap): string {
  return "cover--" + gradSuffix(category, map);
}

/** Classe de dégradé (formations) selon le thème. */
export function gradClass(theme?: string | null, map?: ThemeColorMap): string {
  return "grad grad-mesh grad--" + gradSuffix(theme, map);
}

/** Libellé lisible du niveau : « debutant » → « Débutant ». */
export function levelLabel(level?: string | null): string | null {
  switch (level) {
    case "debutant": return "Débutant";
    case "intermediaire": return "Intermédiaire";
    case "avance": return "Avancé";
    default: return null;
  }
}

/** Session en ligne (visioconférence) plutôt qu'en présentiel. */
export function isOnline(mode?: string | null): boolean {
  return mode === "en_ligne";
}

/** Session hybride : à la fois en présentiel et en ligne. */
export function isHybrid(mode?: string | null): boolean {
  return mode === "hybride";
}

/** Libellé lisible du mode de session. */
export function modeLabel(mode?: string | null): string {
  if (mode === "en_ligne") return "En ligne";
  if (mode === "hybride") return "Présentiel & en ligne";
  return "Présentiel";
}

export function gradSuffix(t?: string | null, map?: ThemeColorMap): string {
  const key = (t || "").toLowerCase().trim();
  // Source de vérité : couleur du thème géré (table themes) si connue…
  if (map && key && map[key]) return map[key];
  // …sinon repli sur l'ancienne heuristique (thèmes non encore migrés).
  const c = (t || "").toLowerCase();
  if (c.includes("ia") || c.includes("intelligence")) return "blue";
  if (c.includes("market") || c.includes("publicit")) return "warm";
  if (c.includes("autom")) return "teal";
  if (c.includes("vente")) return "navy";
  if (c.includes("cas")) return "green";
  return "blue";
}

/** Construit la table nom(minuscule) -> couleur depuis les lignes de la table `themes`. */
export function themeColorMap(themes?: { name?: string | null; color?: string | null }[] | null): ThemeColorMap {
  const m: ThemeColorMap = {};
  for (const t of themes || []) {
    const k = (t?.name || "").toLowerCase().trim();
    if (k && t?.color) m[k] = t.color;
  }
  return m;
}
