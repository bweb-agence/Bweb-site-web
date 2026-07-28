// =========================================================
// Thèmes — palette partagée + helpers (client & serveur)
// La couleur d'un thème pilote badges et dégradés partout, de façon uniforme.
// Les clés doivent rester alignées avec la contrainte SQL (0013) et les
// classes CSS grad--<clé> / cover--<clé>.
// =========================================================

export type ThemeColor = "blue" | "warm" | "teal" | "navy" | "green";

export interface ThemeRow {
  id: string;
  name: string;
  slug: string;
  color: ThemeColor;
  sort_order?: number;
}

/** Palette disponible (ordre = ordre d'affichage dans le sélecteur admin). */
export const THEME_COLORS: { key: ThemeColor; label: string; hex: string }[] = [
  { key: "blue",  label: "Bleu",      hex: "#1f6ced" },
  { key: "warm",  label: "Ambre",     hex: "#f39c12" },
  { key: "teal",  label: "Turquoise", hex: "#0f9d8f" },
  { key: "navy",  label: "Marine",    hex: "#0b1e5b" },
  { key: "green", label: "Vert",      hex: "#16a34a" },
];

const HEX: Record<ThemeColor, string> = Object.fromEntries(
  THEME_COLORS.map((c) => [c.key, c.hex])
) as Record<ThemeColor, string>;

/** Normalise une valeur de couleur venue de la BDD (fallback bleu). */
export function normColor(color?: string | null): ThemeColor {
  const c = (color || "").toLowerCase();
  return (["blue", "warm", "teal", "navy", "green"] as ThemeColor[]).includes(c as ThemeColor)
    ? (c as ThemeColor)
    : "blue";
}

/** Hex représentatif (aperçu admin, pastilles). */
export function themeHex(color?: string | null): string {
  return HEX[normColor(color)];
}

/** Style inline pour une pastille/chip : définit la variable --sw. */
export function themeSwatchStyle(color?: string | null): string {
  return `--sw:${themeHex(color)}`;
}

/** Classe de dégradé (cartes formations/sessions) depuis la couleur du thème. */
export function gradClassFromColor(color?: string | null): string {
  return "grad grad-mesh grad--" + normColor(color);
}

/** Classe de dégradé de couverture (blog) depuis la couleur du thème. */
export function coverClassFromColor(color?: string | null): string {
  return "cover--" + normColor(color);
}

/** Suffixe brut (blue|warm|…) depuis la couleur du thème. */
export function gradSuffixFromColor(color?: string | null): string {
  return normColor(color);
}
