/* =========================================================
   BWEB — Utilitaires partagés des écrans d'acquisition
   (admin/soumissions + admin/contacts)
   ========================================================= */
import { esc } from "./adminUtils";

/* ---------- Formulaires ----------
   Le libellé vient d'abord de la soumission elle-même (`form_title`, saisi au
   moment de l'envoi) : un nouveau formulaire s'affiche correctement sans qu'on
   touche à ce fichier. La table ci-dessous ne sert que de repli lisible. */
const FORM_LABELS: Record<string, string> = {
  contact: "Contact",
  devis: "Devis",
  "webinaire-initiation": "Webinaire — Initiation",
};

/** Couleur de pastille par formulaire — stable, dérivée du nom. */
const FORM_COLORS = ["#1f6ced", "#6b4df0", "#0a9d76", "#d98a00", "#ff835f", "#118b9c"];

export function formLabel(key: string, title?: string | null): string {
  if (title && title.trim()) return title.trim();
  if (FORM_LABELS[key]) return FORM_LABELS[key];
  // « lead-guide-produit-digital » → « Lead guide produit digital »
  const mot = key.replace(/[-_]+/g, " ").trim();
  return mot ? mot[0].toUpperCase() + mot.slice(1) : "Formulaire";
}

export function formColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return FORM_COLORS[Math.abs(h) % FORM_COLORS.length];
}

/* ---------- Canal d'arrivée ----------
   « D'où viennent-ils » : d'abord l'attribution explicite (utm_source), sinon le
   site référent. Une visite sans aucun des deux est un accès direct — un lien
   collé, un favori, une frappe au clavier.

   Les regroupements suivent la façon dont on parle des canaux à l'oral (Meta
   couvre Facebook ET Instagram), pas la valeur technique brute. */
const CANAL_RULES: Array<{ test: RegExp; label: string; color: string }> = [
  { test: /facebook|instagram|meta|fb|ig\b/i, label: "Meta Ads", color: "#1f6ced" },
  { test: /whatsapp|wa\b/i, label: "WhatsApp", color: "#25d366" },
  { test: /tiktok/i, label: "TikTok", color: "#ff835f" },
  { test: /google|bing|duckduckgo|search/i, label: "Recherche Google", color: "#6b4df0" },
  { test: /linkedin/i, label: "LinkedIn", color: "#118b9c" },
  { test: /youtube|yt\b/i, label: "YouTube", color: "#d22d2d" },
  { test: /mail|newsletter|bird/i, label: "E-mail", color: "#d98a00" },
];

const CANAL_DIRECT = { label: "Direct", color: "#8b91ae" };

export interface CanalInfo { label: string; color: string }

export function canalOf(utm: Record<string, string> | null, referrer?: string | null): CanalInfo {
  const source = (utm?.source || "").trim();
  if (source) {
    const rule = CANAL_RULES.find((r) => r.test.test(source));
    // Source inconnue : on l'affiche telle quelle plutôt que de la ranger dans
    // « Direct », qui masquerait une campagne bien réelle.
    return rule ? { label: rule.label, color: rule.color }
                : { label: source, color: "#565d80" };
  }
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, "");
      // Un référent interne n'est pas un canal d'acquisition.
      if (!/bwebagence\.com$|^localhost$/i.test(host)) {
        const rule = CANAL_RULES.find((r) => r.test.test(host));
        return rule ? { label: rule.label, color: rule.color } : { label: host, color: "#565d80" };
      }
    } catch { /* référent illisible : traité comme direct */ }
  }
  return { ...CANAL_DIRECT };
}

/** Résumé lisible d'une campagne : « meta · cpc · parcours-aout ». */
export function utmSummary(utm: Record<string, string> | null): string {
  const parts = [utm?.source, utm?.medium, utm?.campaign].map((v) => (v || "").trim() || "—");
  return parts.every((p) => p === "—") ? "—" : parts.join(" · ");
}

/* ---------- Dates ----------
   Une soumission de ce matin se lit « Aujourd'hui, 09:42 » : dans un écran
   consulté chaque jour, la proximité compte plus que la date exacte. */
export function dwhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const jour = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const auj = new Date();
  const aujJour = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()).getTime();
  const ecart = Math.round((aujJour - jour) / 86_400_000);
  if (ecart === 0) return `Aujourd'hui, ${heure}`;
  if (ecart === 1) return `Hier, ${heure}`;
  if (ecart < 7) return `${d.toLocaleDateString("fr-FR", { weekday: "long" })}, ${heure}`;
  const memeAnnee = d.getFullYear() === auj.getFullYear();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(memeAnnee ? {} : { year: "numeric" }) })
    + `, ${heure}`;
}

/* ---------- Répartition par canal (barres) ---------- */
export function renderCanaux(el: HTMLElement, canaux: CanalInfo[]): void {
  if (!canaux.length) {
    el.innerHTML = `<p class="acq-vide">Aucune soumission sur la période.</p>`;
    return;
  }
  const compte = new Map<string, { n: number; color: string }>();
  for (const c of canaux) {
    const cur = compte.get(c.label) || { n: 0, color: c.color };
    cur.n++;
    compte.set(c.label, cur);
  }
  const liste = [...compte.entries()].sort((a, b) => b[1].n - a[1].n);
  const max = liste[0][1].n;
  el.innerHTML = liste.map(([label, { n, color }]) => `
    <div class="acq-canal">
      <span class="acq-canal-lbl">${esc(label)}</span>
      <span class="acq-canal-bar"><i style="width:${Math.round((n / max) * 100)}%;background:${esc(color)}"></i></span>
      <b>${n}</b>
    </div>`).join("");
}

/* ---------- Pagination ----------
   12 lignes par page : de quoi tenir dans un écran sans faire défiler la page
   entière, et un repère stable — on sait où l'on en est dans la liste. */
export const PAR_PAGE = 12;

/** Fenêtre de pages affichée autour de la page courante (« 1 … 4 5 6 … 12 »). */
function fenetre(page: number, pages: number): Array<number | "…"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set<number>([1, pages, page, page - 1, page + 1]);
  const liste = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  liste.forEach((n, i) => {
    if (i && n - (liste[i - 1] as number) > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/**
 * Dessine la pagination et câble ses boutons. Renvoie la page effective —
 * elle peut différer de celle demandée si la liste a rétréci (filtre appliqué
 * alors qu'on était en page 5 : on ne reste pas sur une page vide).
 */
export function renderPager(
  el: HTMLElement,
  total: number,
  page: number,
  aller: (p: number) => void,
  nom = "élément",
): number {
  const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
  const courante = Math.min(Math.max(1, page), pages);

  if (total <= PAR_PAGE) {
    // Une seule page : afficher un compteur suffit, des boutons inertes non.
    el.innerHTML = total
      ? `<span class="compte">${total} ${esc(nom)}${total > 1 ? "s" : ""}</span>`
      : "";
    return courante;
  }

  const debut = (courante - 1) * PAR_PAGE + 1;
  const fin = Math.min(courante * PAR_PAGE, total);
  el.innerHTML =
    `<span class="compte">${debut}–${fin} sur ${total} ${esc(nom)}s</span>` +
    `<button type="button" data-go="${courante - 1}" ${courante === 1 ? "disabled" : ""} aria-label="Page précédente">‹</button>` +
    fenetre(courante, pages)
      .map((p) => p === "…"
        ? `<span class="ecart">…</span>`
        : `<button type="button" data-go="${p}" class="${p === courante ? "on" : ""}" ${p === courante ? 'aria-current="page"' : ""}>${p}</button>`)
      .join("") +
    `<button type="button" data-go="${courante + 1}" ${courante === pages ? "disabled" : ""} aria-label="Page suivante">›</button>`;

  el.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((b) =>
    b.addEventListener("click", () => { if (!b.disabled) aller(Number(b.dataset.go)); }));

  return courante;
}

/* ---------- Export CSV ----------
   BOM en tête : sans lui, Excel lit l'UTF-8 comme du latin-1 et affiche
   « RÃ©servation ». */
export function downloadCsv(filename: string, head: string[], rows: unknown[][]): void {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [head.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---------- Divers ---------- */
export const digitsOnly = (s?: string | null) => (s || "").replace(/\D/g, "");
export const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";
export const initials = (n?: string | null) => {
  const p = (n || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
};
const PALETTE = ["#1f6ced,#00c89e", "#ff835f,#ffc72a", "#7b5cff,#1f6ced", "#00c89e,#0aa886", "#565d80,#8b91ae", "#f2971d,#ff835f", "#1550b8,#1f6ced"];
export const avatarBg = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `linear-gradient(135deg,${PALETTE[Math.abs(h) % PALETTE.length]})`;
};
