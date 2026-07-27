/* =========================================================
   BWEB — Fiche session : favori + modale de réservation
   (tarifs → infos → paiement → justificatif → confirmation)
   ========================================================= */
const SB_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SB_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

const fmt = (n: number) => n.toLocaleString("fr-FR") + " F CFA";

function initFavorite() {
  const fav = document.getElementById("fav");
  if (!fav) return;
  let anon = localStorage.getItem("bweb_anon");
  if (!anon) { anon = crypto.randomUUID(); localStorage.setItem("bweb_anon", anon); }
  const id = (fav as HTMLElement).dataset.sessionId!;
  const favSet = new Set<string>(JSON.parse(localStorage.getItem("bweb_favs") || "[]"));
  if (favSet.has(id)) fav.classList.add("is-on");
  fav.addEventListener("click", async () => {
    const countEl = fav.querySelector(".fav-count")!;
    const wasOn = fav.classList.contains("is-on");
    fav.classList.toggle("is-on", !wasOn);
    countEl.textContent = String(Math.max(0, parseInt(countEl.textContent || "0") + (wasOn ? -1 : 1)));
    wasOn ? favSet.delete(id) : favSet.add(id);
    localStorage.setItem("bweb_favs", JSON.stringify([...favSet]));
    try {
      await fetch(`${SB_URL}/rest/v1/rpc/toggle_favorite`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        body: JSON.stringify({ p_target_type: "session", p_target_id: id, p_anon_id: anon }),
      });
    } catch {}
  });
}

export function initReservation() {
  initFavorite();

  const overlay = document.getElementById("rz");
  if (!overlay) return;

  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const steps = Array.from(overlay.querySelectorAll<HTMLElement>(".rz-step"));
  const tickets = Array.from(overlay.querySelectorAll<HTMLElement>("[data-ticket]"));
  const prevBtn = $("rz-prev")!, nextBtn = $("rz-next")!, doneBtn = $("rz-done")!, errEl = $("rz-err")!;
  const FORM_STEPS = 4;
  let step = 1;
  let method = "";

  // ---------- Tarifs ----------
  function selection() {
    const lines: { id: string; name: string; qty: number; price: number }[] = [];
    let total = 0;
    tickets.forEach((t) => {
      const qty = parseInt(t.querySelector<HTMLElement>("[data-val]")?.textContent || "0");
      if (qty > 0) {
        const price = parseInt(t.dataset.price || "0");
        total += price * qty;
        lines.push({ id: t.dataset.id!, name: t.dataset.name!, qty, price });
      }
    });
    return { lines, total };
  }
  function refreshTotal() {
    const { lines, total } = selection();
    const linesEl = $("rz-lines")!, totalEl = $("rz-total")!;
    linesEl.innerHTML = lines.length
      ? lines.map((l) => `<div class="row"><span>${l.qty}× ${l.name}</span><span>${fmt(l.price * l.qty)}</span></div>`).join("")
      : `<div class="row muted"><span>Aucune place sélectionnée</span></div>`;
    totalEl.textContent = fmt(total);
  }
  tickets.forEach((t) => {
    const max = parseInt(t.dataset.remaining || "0");
    const valEl = t.querySelector<HTMLElement>("[data-val]")!;
    t.querySelector("[data-inc]")?.addEventListener("click", () => {
      const v = parseInt(valEl.textContent || "0");
      if (v < max) { valEl.textContent = String(v + 1); refreshTotal(); }
    });
    t.querySelector("[data-dec]")?.addEventListener("click", () => {
      const v = parseInt(valEl.textContent || "0");
      if (v > 0) { valEl.textContent = String(v - 1); refreshTotal(); }
    });
  });

  // ---------- Paiement ----------
  overlay.querySelectorAll<HTMLElement>(".pm").forEach((pm) => {
    pm.addEventListener("click", () => {
      overlay.querySelectorAll(".pm").forEach((p) => p.classList.remove("sel"));
      pm.classList.add("sel");
      method = pm.dataset.method || "";
      renderPayNote();
    });
  });
  function renderPayNote() {
    const note = $("pm-note")!;
    const { total } = selection();
    const phone = overlay.dataset.phone;
    const deposit = Math.ceil(total / 2);
    const map: Record<string, string> = {
      wave: `Envoyez <b>${fmt(total)}</b> au <b>${phone}</b> via <b>Wave</b>, puis indiquez la référence à l'étape suivante.`,
      orange_money: `Envoyez <b>${fmt(total)}</b> au <b>${phone}</b> via <b>Orange Money</b> (#144#), puis indiquez la référence.`,
      mobile_money: `Envoyez <b>${fmt(total)}</b> au <b>${phone}</b> via <b>MTN / Moov Money</b>, puis indiquez la référence.`,
      sur_place: `Réglez un acompte de <b>${fmt(deposit)}</b> (50 %) pour bloquer votre place ; le solde se règle sur place le jour J.`,
    };
    note.innerHTML = map[method] || "";
    note.style.display = method ? "block" : "none";
  }

  // ---------- Justificatif ----------
  const fileInput = $("rz-file") as HTMLInputElement | null;
  fileInput?.addEventListener("change", () => {
    const label = $("rz-upload-label")!, sub = $("rz-upload-sub")!;
    if (fileInput.files?.length) {
      label.classList.add("has");
      label.firstChild!.textContent = "✓ Capture ajoutée";
      sub.textContent = fileInput.files[0].name;
    }
  });
  function renderSummary2() {
    const { lines, total } = selection();
    const isDep = method === "sur_place";
    const due = isDep ? Math.ceil(total / 2) : total;
    $("rz-summary2")!.innerHTML =
      lines.map((l) => `<div class="row"><span>${l.qty}× ${l.name}</span><span>${fmt(l.price * l.qty)}</span></div>`).join("") +
      `<div class="row"><span>Moyen</span><span>${methodLabel(method)}</span></div>` +
      `<div class="row tot"><span>${isDep ? "Acompte à régler" : "Total"}</span><b>${fmt(due)}</b></div>`;
  }
  function methodLabel(m: string) {
    return { wave: "Wave", orange_money: "Orange Money", mobile_money: "Mobile Money", sur_place: "Sur place (acompte)" }[m] || "—";
  }

  // ---------- Navigation ----------
  function show(n: number) {
    step = n;
    steps.forEach((s) => s.classList.toggle("active", +s.dataset.step! === n));
    overlay.querySelectorAll<HTMLElement>(".rz-progress .p").forEach((p) => {
      const i = +p.dataset.p!;
      p.classList.toggle("active", i === n);
      p.classList.toggle("done", i < n);
    });
    prevBtn.style.display = n > 1 && n <= FORM_STEPS ? "inline-flex" : "none";
    nextBtn.style.display = n <= FORM_STEPS ? "inline-flex" : "none";
    doneBtn.style.display = n > FORM_STEPS ? "inline-flex" : "none";
    nextBtn.textContent = n === FORM_STEPS ? "Valider mon inscription" : "Continuer ›";
    errEl.textContent = "";
    if (n === 3) renderPayNote();
    if (n === 4) renderSummary2();
    overlay.querySelector(".rz-scroll")!.scrollTop = 0;
  }

  function validate(n: number): boolean {
    errEl.textContent = "";
    if (n === 1) {
      if (selection().total <= 0 && selection().lines.length === 0) { errEl.textContent = "Sélectionnez au moins une place."; return false; }
      return true;
    }
    if (n === 2) {
      const req = ["rz-name", "rz-email", "rz-phone"];
      let ok = true;
      req.forEach((id) => {
        const el = $(id) as HTMLInputElement;
        const empty = !el.value.trim();
        el.setAttribute("aria-invalid", empty ? "true" : "false");
        if (empty) ok = false;
      });
      if (!ok) errEl.textContent = "Merci de remplir les champs obligatoires.";
      return ok;
    }
    if (n === 3) {
      if (!method) { errEl.textContent = "Choisissez un moyen de paiement."; return false; }
      return true;
    }
    if (n === 4) {
      if (!($("rz-confirm") as HTMLInputElement).checked) { errEl.textContent = "Merci de confirmer le paiement."; return false; }
      return true;
    }
    return true;
  }

  nextBtn.addEventListener("click", async () => {
    if (!validate(step)) return;
    if (step < FORM_STEPS) { show(step + 1); return; }
    await submit();
  });
  prevBtn.addEventListener("click", () => { if (step > 1) show(step - 1); });

  // ---------- Soumission ----------
  async function submit() {
    nextBtn.setAttribute("disabled", "true");
    nextBtn.textContent = "Envoi…";
    const { lines, total } = selection();
    const fd = new FormData();
    fd.append("session_id", overlay.dataset.session!);
    fd.append("lines", JSON.stringify(lines.map((l) => ({ ticket_type_id: l.id, quantity: l.qty }))));
    fd.append("name", ($("rz-name") as HTMLInputElement).value.trim());
    fd.append("email", ($("rz-email") as HTMLInputElement).value.trim());
    const phoneEl = $("rz-phone") as HTMLInputElement;
    const phoneCc = (phoneEl.closest(".phone-field")?.querySelector('[name="phone_cc"]') as HTMLSelectElement | null)?.value || "";
    const phoneVal = phoneEl.value.trim();
    fd.append("phone", phoneVal ? (phoneCc ? `${phoneCc} ${phoneVal}` : phoneVal) : "");
    fd.append("company", ($("rz-company") as HTMLInputElement).value.trim());
    fd.append("payment_method", method);
    fd.append("payment_reference", ($("rz-ref") as HTMLInputElement).value.trim());
    fd.append("is_deposit", method === "sur_place" ? "1" : "0");
    if (fileInput?.files?.[0]) fd.append("proof", fileInput.files[0]);

    let json: any = null;
    try {
      const res = await fetch("/api/reserver", { method: "POST", body: fd });
      json = await res.json();
    } catch { json = { ok: false, error: "network" }; }

    nextBtn.removeAttribute("disabled");

    if (json?.ok) {
      success(json.reference, false);
    } else if (json?.error === "not_configured") {
      whatsappFallback(lines, total);
      success(null, true);
    } else if (json?.error === "sold_out") {
      errEl.textContent = "Désolé, il ne reste plus assez de places pour ce tarif.";
      nextBtn.textContent = "Valider mon inscription";
      show(1);
    } else {
      errEl.textContent = "Une erreur est survenue. Réessayez ou finalisez sur WhatsApp.";
      nextBtn.textContent = "Valider mon inscription";
    }
  }

  function whatsappFallback(lines: { name: string; qty: number }[], total: number) {
    const isDep = method === "sur_place";
    const msg =
      `Bonjour Bweb Agence, je souhaite réserver « ${overlay.dataset.title} » du ${overlay.dataset.date}.\n` +
      `Tarifs : ${lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}\n` +
      `${isDep ? "Acompte" : "Total"} : ${fmt(isDep ? Math.ceil(total / 2) : total)}\n` +
      `Nom : ${($("rz-name") as HTMLInputElement).value}\nPaiement : ${methodLabel(method)}` +
      (($("rz-ref") as HTMLInputElement).value ? `\nRéférence : ${($("rz-ref") as HTMLInputElement).value}` : "") +
      `\n(Je joins la capture du paiement à ce message.)`;
    window.open(`https://wa.me/${overlay.dataset.wa}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  function success(reference: string | null, viaWhatsApp: boolean) {
    show(5);
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
    doneBtn.style.display = "inline-flex";
    overlay.querySelectorAll<HTMLElement>(".rz-progress .p").forEach((p) => p.classList.add("done"));
    if (viaWhatsApp) {
      $("rz-success-title")!.textContent = "Demande envoyée sur WhatsApp";
      $("rz-success-sub")!.textContent = "Finalisez l'envoi (avec la capture) dans WhatsApp pour confirmer votre place.";
      $("rz-ref-out")!.textContent = "";
      $("rz-wait-note")!.textContent = "Notre équipe confirme votre inscription après vérification du paiement.";
    } else {
      $("rz-ref-out")!.textContent = reference || "";
      $("rz-success-sub")!.textContent = "Votre place est réservée.";
    }
  }

  // ---------- Ouverture / fermeture (avec gestion du focus) ----------
  let lastFocused: HTMLElement | null = null;
  const focusablesIn = (el: HTMLElement) =>
    Array.from(
      el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((n) => n.offsetParent !== null);

  function open() {
    lastFocused = document.activeElement as HTMLElement;
    overlay.classList.add("is-open");
    document.body.classList.add("rz-lock");
    show(1);
    refreshTotal();
    // Focus dans la modale (bouton fermer par défaut).
    (document.getElementById("rz-close") as HTMLElement | null)?.focus();
  }
  function close() {
    overlay.classList.remove("is-open");
    document.body.classList.remove("rz-lock");
    lastFocused?.focus(); // rend le focus au bouton déclencheur
  }
  $("open-rz")?.addEventListener("click", open);
  $("rz-close")?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (!overlay.classList.contains("is-open")) return;
    if (e.key === "Escape" && step <= FORM_STEPS) { close(); return; }
    // Piège de focus : Tab boucle à l'intérieur de la modale.
    if (e.key === "Tab") {
      const f = focusablesIn(overlay);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && (active === first || !overlay.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  });

  refreshTotal();
}
