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

/** Classe de dégradé de couverture (blog) selon la catégorie/thème. */
export function coverClass(category?: string | null): string {
  return "cover--" + gradSuffix(category);
}

/** Classe de dégradé (formations) selon le thème. */
export function gradClass(theme?: string | null): string {
  return "grad grad-mesh grad--" + gradSuffix(theme);
}

export function gradSuffix(t?: string | null): string {
  const c = (t || "").toLowerCase();
  if (c.includes("ia") || c.includes("intelligence")) return "blue";
  if (c.includes("market") || c.includes("publicit")) return "warm";
  if (c.includes("autom")) return "teal";
  if (c.includes("vente")) return "navy";
  if (c.includes("cas")) return "green";
  return "blue";
}
