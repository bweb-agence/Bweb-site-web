/* =========================================================
   BWEB — Fiche session : favori + modale de réservation
   (tarifs → infos → paiement → justificatif → confirmation)
   ========================================================= */
const SB_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SB_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

const fmt = (n: number) => n.toLocaleString("fr-FR") + " F CFA";

// Petite explosion de confettis depuis un élément (récompense au clic « + »).
function confettiBurst(target: HTMLElement) {
  const r = target.getBoundingClientRect();
  const host = document.createElement("div");
  host.className = "confetti-host";
  host.style.left = `${r.left + r.width / 2}px`;
  host.style.top = `${r.top + r.height / 2}px`;
  document.body.appendChild(host);
  const colors = ["#1f6ced", "#00c89e", "#ffb020", "#ff5a6a", "#7b5cff"];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const p = document.createElement("i");
    const ang = (Math.PI * 2 * i) / N + (Math.random() - 0.5) * 0.5;
    const dist = 24 + Math.random() * 18;
    p.style.setProperty("--x", `${Math.cos(ang) * dist}px`);
    p.style.setProperty("--y", `${Math.sin(ang) * dist}px`);
    p.style.background = colors[i % colors.length];
    host.appendChild(p);
  }
  setTimeout(() => host.remove(), 700);
}

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
  const bumps = Array.from(overlay.querySelectorAll<HTMLElement>("[data-bump]"));
  const prevBtn = $("rz-prev")!, nextBtn = $("rz-next")!, doneBtn = $("rz-done")!, errEl = $("rz-err")!;
  const FORM_STEPS = 4;
  let step = 1;
  let method = "";
  // URL du relais paiement (Hostinger, IP fixe) — injectée côté serveur.
  const PAY_API = (overlay.dataset.payApi || "").replace(/\/+$/, "");

  // ---------- Validation e-mail / téléphone ----------
  // Indicatif pays sélectionné, en chiffres (ex. « +225 » → « 225 »).
  function dialDigits(): string {
    const sel = ($("rz-phone") as HTMLElement | null)?.closest(".phone-field")?.querySelector('[name="phone_cc"]') as HTMLSelectElement | null;
    return (sel?.value || "").replace(/\D/g, "");
  }
  // E-mail : format réaliste (partie locale @ domaine . TLD ≥ 2), sans points doublés.
  function isValidEmail(v: string): boolean {
    const s = v.trim();
    if (s.length < 6 || s.length > 254) return false;
    if (/\.\./.test(s) || /^[.@]|[.@]$/.test(s) || /\.@|@\./.test(s)) return false;
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(s);
  }
  // Numéro national saisi, en chiffres uniquement.
  function phoneNat(): string {
    return (($("rz-phone") as HTMLInputElement | null)?.value || "").replace(/\D/g, "");
  }
  // Téléphone valide : longueur nationale plausible (6–14 chiffres), total E.164 ≤ 15,
  // pas une suite de zéros. Couvre la Côte d'Ivoire (10 chiffres) et l'international.
  function isValidPhone(): boolean {
    const nat = phoneNat();
    if (nat.length < 6 || nat.length > 14) return false;
    if (/^0+$/.test(nat)) return false;
    const total = dialDigits().length + nat.length;
    return total >= 8 && total <= 15;
  }
  const markField = (el: HTMLElement | null, ok: boolean) => el?.setAttribute("aria-invalid", ok ? "false" : "true");

  // Mémorisation locale des coordonnées → pré-remplissage aux visites suivantes.
  const INFO_KEY = "bweb_resa_infos";
  function saveInfos() {
    try {
      localStorage.setItem(INFO_KEY, JSON.stringify({
        name: ($("rz-name") as HTMLInputElement | null)?.value.trim() || "",
        email: ($("rz-email") as HTMLInputElement | null)?.value.trim() || "",
        phone: ($("rz-phone") as HTMLInputElement | null)?.value.trim() || "",
        company: ($("rz-company") as HTMLInputElement | null)?.value.trim() || "",
      }));
    } catch {}
  }
  function loadInfos() {
    try {
      const d = JSON.parse(localStorage.getItem(INFO_KEY) || "{}");
      const set = (id: string, v: string) => { const el = $(id) as HTMLInputElement | null; if (el && v && !el.value) el.value = v; };
      set("rz-name", d.name); set("rz-email", d.email); set("rz-phone", d.phone); set("rz-company", d.company);
    } catch {}
  }

  // ---------- Mode de participation (sessions hybrides) ----------
  const isHybrid = overlay.dataset.mode === "hybride";
  let attendance = "";
  const attendLabel = (a: string) => (a === "en_ligne" ? "En ligne" : a === "presentiel" ? "Sur place" : "—");
  const attendOpts = Array.from(overlay.querySelectorAll<HTMLElement>(".rz-attend-opt"));
  attendOpts.forEach((opt) => {
    opt.addEventListener("click", () => {
      attendOpts.forEach((o) => o.setAttribute("aria-pressed", "false"));
      opt.setAttribute("aria-pressed", "true");
      attendance = opt.dataset.attend || "";
      errEl.textContent = "";
    });
  });

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
    // Order bumps cochés → une place chacun.
    bumps.forEach((b) => {
      const cb = b.querySelector<HTMLInputElement>(".ob-check");
      if (cb?.checked) {
        const price = parseInt(b.dataset.price || "0");
        total += price;
        lines.push({ id: b.dataset.id!, name: b.dataset.name!, qty: 1, price });
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
    const dec = t.querySelector<HTMLButtonElement>("[data-dec]");
    const inc = t.querySelector<HTMLButtonElement>("[data-inc]");
    if (max > 0) t.classList.add("is-tappable");
    const apply = (v: number, animate = false) => {
      valEl.textContent = String(v);
      if (dec) dec.disabled = v <= 0;
      if (inc) inc.disabled = v >= max;
      t.classList.toggle("is-picked", v > 0);
      if (animate) { valEl.classList.remove("bump"); void valEl.offsetWidth; valEl.classList.add("bump"); }
    };
    const increment = () => {
      const v = parseInt(valEl.textContent || "0");
      if (v >= max) return;
      apply(v + 1, true); refreshTotal();
      try { navigator.vibrate?.(12); } catch {}
      confettiBurst(inc || t);
    };
    const decrement = () => { const v = parseInt(valEl.textContent || "0"); if (v > 0) { apply(v - 1, true); refreshTotal(); } };
    apply(0);
    inc?.addEventListener("click", (e) => { e.stopPropagation(); increment(); });
    dec?.addEventListener("click", (e) => { e.stopPropagation(); decrement(); });
    // Carte entière cliquable (hors stepper) → ajoute une place (grande zone de tap).
    t.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-stepper]")) return;
      increment();
    });
  });

  // Order bumps : coche = ajout au panier, avec effet visuel « ajouté ».
  bumps.forEach((b) => {
    const cb = b.querySelector<HTMLInputElement>(".ob-check");
    const cta = b.querySelector<HTMLElement>(".ob-cta");
    cb?.addEventListener("change", () => {
      b.classList.toggle("is-added", cb.checked);
      if (cta) cta.textContent = cb.checked ? "Ajouté ✓" : "Ajouter";
      if (cb.checked) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
      refreshTotal();
    });
  });

  // ---------- Paiement ----------
  overlay.querySelectorAll<HTMLElement>(".rz-payopt").forEach((pm) => {
    pm.addEventListener("click", () => {
      overlay.querySelectorAll(".rz-payopt").forEach((p) => { p.classList.remove("sel"); p.setAttribute("aria-checked", "false"); });
      pm.classList.add("sel");
      pm.setAttribute("aria-checked", "true");
      method = pm.dataset.method || "";
      updateNextLabel();
    });
  });
  // Money Fusion mis en avant : présélectionné par défaut (classe .sel dans le markup).
  const preselected = overlay.querySelector<HTMLElement>(".rz-payopt.sel");
  if (preselected) method = preselected.dataset.method || "";
  // Le paiement en ligne (Money Fusion) se règle directement à l'étape 3 :
  // pas d'étape justificatif → le bouton « Continuer » devient « Payer <montant> ».
  function updateNextLabel() {
    if (step !== 3) return;
    const { total } = selection();
    const deposit = Math.max(1, Math.ceil(total / 2));
    nextBtn.textContent = method === "money_fusion" ? `Payer ${fmt(total)} ›`
      : method === "money_fusion_acompte" ? `Payer ${fmt(deposit)} ›`
      : "Continuer ›";
  }
  // Renseigne le montant porté par chaque option (total / acompte / solde restant).
  function renderPayAmounts() {
    const { total } = selection();
    const deposit = Math.max(1, Math.ceil(total / 2));
    const solde = total - deposit;
    const set = (sel: string, v: string) => { const el = overlay.querySelector(sel); if (el) el.textContent = v; };
    set("[data-amt-full]", fmt(total));
    set("[data-amt-deposit]", fmt(deposit));
    set("[data-amt-solde]", fmt(solde));
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
      (isHybrid && attendance ? `<div class="row"><span>Participation</span><span>${attendLabel(attendance)}</span></div>` : "") +
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
    if (n === 3) { renderPayAmounts(); updateNextLabel(); }
    if (n === 4) renderSummary2();
    overlay.querySelector(".rz-scroll")!.scrollTop = 0;
  }

  function validate(n: number): boolean {
    errEl.textContent = "";
    if (n === 1) {
      if (isHybrid && !attendance) { errEl.textContent = "Choisissez comment participer : sur place ou en ligne."; return false; }
      if (selection().total <= 0 && selection().lines.length === 0) { errEl.textContent = "Sélectionnez au moins une place."; return false; }
      return true;
    }
    if (n === 2) {
      const nameEl = $("rz-name") as HTMLInputElement;
      const emailEl = $("rz-email") as HTMLInputElement;
      const phoneEl = $("rz-phone") as HTMLInputElement;
      const nameOk = nameEl.value.trim().length >= 2;
      const emailOk = isValidEmail(emailEl.value);
      const phoneOk = isValidPhone();
      markField(nameEl, nameOk);
      markField(emailEl, emailOk);
      markField(phoneEl, phoneOk);
      let bad: HTMLInputElement | null = null;
      let msg = "";
      if (!nameOk) { bad = nameEl; msg = "Indiquez votre nom complet."; }
      else if (!emailOk) { bad = emailEl; msg = emailEl.value.trim() ? "Adresse e-mail invalide — vérifiez le format (ex. nom@domaine.com)." : "Indiquez votre adresse e-mail."; }
      else if (!phoneOk) { bad = phoneEl; msg = phoneNat() ? "Numéro de téléphone invalide — vérifiez qu'il est complet." : "Indiquez votre numéro de téléphone."; }
      if (bad) { errEl.textContent = msg; try { bad.focus(); } catch {} return false; }
      return true;
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
    // Paiement en ligne : on règle dès l'étape 3 (pas de justificatif).
    if (step === 3 && (method === "money_fusion" || method === "money_fusion_acompte")) { await submitOnline(); return; }
    if (step < FORM_STEPS) { show(step + 1); return; }
    await submit();
  });
  prevBtn.addEventListener("click", () => { if (step > 1) show(step - 1); });

  // ---------- Soumission ----------
  async function submit() {
    nextBtn.setAttribute("disabled", "true");
    nextBtn.textContent = "Envoi…";
    saveInfos(); // mémorise les coordonnées pour la prochaine fois
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
    if (isHybrid && attendance) fd.append("attendance_mode", attendance);
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

  // ---------- Paiement en ligne (Money Fusion) ----------
  async function submitOnline() {
    // Garde-fou : jamais de paiement avec un e-mail ou un numéro invalide.
    if (!isValidEmail(($("rz-email") as HTMLInputElement).value) || !isValidPhone()) {
      show(2); errEl.textContent = "Vérifiez votre e-mail et votre numéro avant de payer.";
      markField($("rz-email"), isValidEmail(($("rz-email") as HTMLInputElement).value));
      markField($("rz-phone"), isValidPhone());
      return;
    }
    const resetBtn = () => { nextBtn.removeAttribute("disabled"); nextBtn.textContent = method === "money_fusion_acompte" ? "Payer l'acompte ›" : "Payer en ligne ›"; };
    nextBtn.setAttribute("disabled", "true");
    nextBtn.textContent = "Redirection…";
    errEl.textContent = "";
    let redirecting = false;
    try {
      const { lines, total } = selection();
      const name = ($("rz-name") as HTMLInputElement).value.trim();
      const email = ($("rz-email") as HTMLInputElement).value.trim();
      const phoneEl = $("rz-phone") as HTMLInputElement;
      const phoneCc = (phoneEl.closest(".phone-field")?.querySelector('[name="phone_cc"]') as HTMLSelectElement | null)?.value || "";
      const phoneVal = phoneEl.value.trim();
      const phone = phoneVal ? (phoneCc ? `${phoneCc} ${phoneVal}` : phoneVal) : "";
      // Numéro LOCAL (chiffres) transmis à Money Fusion = numéro à débiter pour valider.
      const numeroSend = phoneVal.replace(/\D/g, "");
      // Total, ou acompte 50 % (le solde se paie alors sur place le jour J).
      const isDeposit = method === "money_fusion_acompte";
      const amount = isDeposit ? Math.max(1, Math.ceil(total / 2)) : total;
      saveInfos();

      if (!PAY_API) { errEl.textContent = "Le paiement en ligne est momentanément indisponible."; return; }

      // 1) Créer le paiement Money Fusion D'ABORD. Aucune réservation n'est créée
      //    tant que le paiement n'est pas accepté → plus de réservation « fantôme ».
      let token = "";
      let payUrl = "";
      try {
        const pres = await fetch(`${PAY_API}/pay.php`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            montant: amount,
            nom: name,
            telephone: numeroSend,
            article: overlay.dataset.title || "Formation Bweb",
            meta: { session_id: overlay.dataset.session, email },
          }),
        });
        const pj = await pres.json();
        if (!pj?.ok || !pj?.url) throw new Error("no_url");
        token = pj.token || "";
        payUrl = pj.url;
      } catch {
        errEl.textContent = "Le paiement en ligne n'a pas pu démarrer. Réessayez ou finalisez sur WhatsApp.";
        return;
      }

      // 2) Paiement accepté → créer la (les) réservation(s) « en attente », en stockant
      //    le jeton Money Fusion comme référence (sert à confirmer au retour du paiement).
      const fd = new FormData();
      fd.append("session_id", overlay.dataset.session!);
      fd.append("lines", JSON.stringify(lines.map((l) => ({ ticket_type_id: l.id, quantity: l.qty }))));
      fd.append("name", name);
      fd.append("email", email);
      fd.append("phone", phone);
      fd.append("company", ($("rz-company") as HTMLInputElement).value.trim());
      fd.append("payment_method", "money_fusion");
      fd.append("payment_reference", token);
      fd.append("is_deposit", isDeposit ? "1" : "0");
      if (isHybrid && attendance) fd.append("attendance_mode", attendance);

      let json: any = null;
      try {
        const res = await fetch("/api/reserver", { method: "POST", body: fd });
        json = await res.json();
      } catch { json = { ok: false, error: "network" }; }

      if (!json?.ok) {
        if (json?.error === "not_configured") { whatsappFallback(lines, total); success(null, true); }
        else if (json?.error === "sold_out") { errEl.textContent = "Désolé, il ne reste plus assez de places pour ce tarif."; show(1); }
        else errEl.textContent = "Une erreur est survenue. Réessayez ou finalisez sur WhatsApp.";
        return;
      }

      // 3) Tout est prêt → rediriger vers la page de paiement Money Fusion.
      redirecting = true;
      window.location.href = payUrl;
    } catch {
      errEl.textContent = "Une erreur est survenue. Réessayez ou finalisez sur WhatsApp.";
    } finally {
      // Le bouton se réactive toujours, sauf si on part vers la page de paiement.
      if (!redirecting) resetBtn();
    }
  }

  function whatsappFallback(lines: { name: string; qty: number }[], total: number) {
    const isDep = method === "sur_place";
    const msg =
      `Bonjour Bweb Agence, je souhaite réserver « ${overlay.dataset.title} » du ${overlay.dataset.date}.\n` +
      (isHybrid && attendance ? `Participation : ${attendLabel(attendance)}\n` : "") +
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
    loadInfos(); // pré-remplit nom/e-mail/téléphone mémorisés
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
  // Déclencheurs additionnels (ex. CTA collant en bas de page sur mobile).
  document.querySelectorAll<HTMLElement>("[data-rz-open]").forEach((b) => b.addEventListener("click", open));
  $("rz-close")?.addEventListener("click", close);

  // Retour visuel en direct : on lève le drapeau (et l'erreur) dès que le champ redevient valide,
  // et on le marque en erreur à la sortie du champ s'il est renseigné mais incorrect.
  const emailInput = $("rz-email") as HTMLInputElement | null;
  const phoneInput = $("rz-phone") as HTMLInputElement | null;
  emailInput?.addEventListener("input", () => { if (isValidEmail(emailInput.value)) { markField(emailInput, true); if (step === 2) errEl.textContent = ""; } });
  emailInput?.addEventListener("blur", () => markField(emailInput, isValidEmail(emailInput.value) || !emailInput.value.trim()));
  phoneInput?.addEventListener("input", () => { if (isValidPhone()) { markField(phoneInput, true); if (step === 2) errEl.textContent = ""; } });
  phoneInput?.addEventListener("blur", () => markField(phoneInput, isValidPhone() || !phoneNat()));
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
