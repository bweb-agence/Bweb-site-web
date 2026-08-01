/* =========================================================
   BWEB — Utilitaires partagés de l'admin (côté navigateur)
   ========================================================= */

export const slugify = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Montant admin : « F CFA » en petit (<small class="fcfa">) pour occuper moins de
// place. ⚠️ Renvoie du HTML → toujours l'injecter via innerHTML (jamais textContent).
export const fmtFCFA = (n: unknown): string => (Number(n) || 0).toLocaleString("fr-FR") + ' <small class="fcfa">F CFA</small>';

export const dshort = (d?: string | null): string =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const dtLocalValue = (d?: string | null): string => {
  // Pour un <input type="datetime-local"> : "YYYY-MM-DDTHH:mm" en heure locale
  const dt = d ? new Date(d) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

/* Valide une réservation via l'endpoint serveur (qui envoie l'e-mail de confirmation).
   Repli sur la fonction RPC directe si le paiement en ligne n'est pas encore configuré
   (ex. en local sans clé service_role) — la validation marche alors sans e-mail. */
export async function confirmBooking(supa: any, bookingId: string): Promise<boolean> {
  try {
    const { data: { session } } = await supa.auth.getSession();
    const res = await fetch("/api/admin/confirmer", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ booking_id: bookingId }),
    });
    const j = await res.json();
    if (j.ok) return true;
    if (j.error === "not_configured") {
      const { error } = await supa.rpc("confirm_booking", { p_booking_id: bookingId, p_amount_paid: null });
      return !error;
    }
    return false;
  } catch {
    return false;
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, kind: "ok" | "err" = "ok") {
  let el = document.getElementById("a-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "a-toast";
    document.body.appendChild(el);
  }
  el.className = "a-toast " + kind + " show";
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el!.className = "a-toast " + kind; }, 3200);
}

/**
 * Modale de confirmation (remplace window.confirm, souvent bloqué par le navigateur).
 * Renvoie une promesse : true si confirmé, false sinon. Échap / clic-fond = annuler,
 * Entrée = confirmer. Utiliser `danger: true` pour les actions destructives.
 */
export function confirmModal(opts: {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null;
    const overlay = document.createElement("div");
    overlay.className = "cm-overlay";
    const msgHtml = esc(opts.message).replace(/\n/g, "<br>");
    overlay.innerHTML =
      `<div class="cm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cm-title" aria-describedby="cm-msg">
        <h3 id="cm-title" class="cm-title">${esc(opts.title || "Confirmer l'action")}</h3>
        <p id="cm-msg" class="cm-msg">${msgHtml}</p>
        <div class="cm-actions">
          <button type="button" class="abtn cm-cancel">${esc(opts.cancelLabel || "Annuler")}</button>
          <button type="button" class="abtn ${opts.danger ? "cm-danger" : "primary"} cm-ok">${esc(opts.confirmLabel || (opts.danger ? "Supprimer" : "Confirmer"))}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => overlay.classList.add("show"));
    const done = (val: boolean) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 160);
      document.body.style.overflow = "";
      try { prev?.focus?.(); } catch { /* ignore */ }
      resolve(val);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); done(false); }
      else if (e.key === "Enter") { e.preventDefault(); done(true); }
    };
    overlay.querySelector(".cm-cancel")!.addEventListener("click", () => done(false));
    overlay.querySelector(".cm-ok")!.addEventListener("click", () => done(true));
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) done(false); });
    document.addEventListener("keydown", onKey, true);
    (overlay.querySelector(".cm-ok") as HTMLElement).focus();
  });
}
