/* =========================================================
   BWEB AGENCE — Assistant multi-étapes en MODALE plein écran
   -----------------------------------------------------------
   Sur <form data-wizard> (Contact & Devis) :
     • On construit une modale plein écran (type Typeform) : barre de
       progression + fermer épinglés en haut, UNE étape centrée, navigation
       Précédent/Suivant épinglée en bas → aucun scroll pour avancer.
     • La page affiche un bouton « Démarrer » qui ouvre la modale.
     • La soumission reste gérée par forms.ts (form + .form-success déplacés
       ensemble dans la modale pour que le succès s'affiche dedans).

   Progressive enhancement : sans JS, toutes les étapes restent visibles et
   le formulaire fonctionne normalement (rien de tout ceci ne s'exécute).
   Respect de prefers-reduced-motion (pas d'animation JS ; CSS gère le reste).
   ========================================================= */

type FieldEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Dir = "next" | "prev" | "init";

const prefersReduced = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ARROW_BACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="20" y1="12" x2="4" y2="12"/><polyline points="10 18 4 12 10 6"/></svg>';
const ARROW_FWD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></svg>';
const CLOSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

function firstFocusable(step: HTMLElement): FieldEl | null {
  return step.querySelector<FieldEl>(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
  );
}

function isBad(field: FieldEl, form: HTMLFormElement): boolean {
  if (field instanceof HTMLInputElement && field.type === "radio") {
    return !form.querySelector(`input[name="${field.name}"]:checked`);
  }
  const value = (field.value || "").trim();
  if (!value) return true;
  if (field instanceof HTMLInputElement && field.type === "email") return !field.checkValidity();
  return false;
}

export function initWizard(): void {
  const formEl = document.querySelector<HTMLFormElement>("form[data-wizard]");
  if (!formEl) return;
  const form: HTMLFormElement = formEl;

  const steps = Array.from(form.querySelectorAll<HTMLElement>("[data-wizard-step]"));
  if (steps.length < 2) return;

  const total = steps.length;
  const card = form.closest<HTMLElement>(".form-card");
  const success = card?.querySelector<HTMLElement>(".form-success") ?? null;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const status = form.querySelector<HTMLElement>(".form-status");
  const note = form.querySelector<HTMLElement>(".form-note");
  let current = 0;

  form.classList.add("wizard-on");

  /* ---------- Modale plein écran ---------- */
  const modal = document.createElement("div");
  modal.className = "wiz-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", form.getAttribute("data-form-title") || "Formulaire");
  modal.hidden = true;

  const panel = document.createElement("div");
  panel.className = "wiz-modal__panel";
  modal.appendChild(panel);

  // En-tête épinglé : progression + compteur + fermer
  const head = document.createElement("div");
  head.className = "wiz-modal__head";
  head.innerHTML =
    '<div class="wiz-progress" role="presentation"><span class="wiz-progress__bar"></span></div>' +
    '<p class="wiz-count" aria-live="polite"></p>';
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "wiz-close";
  closeBtn.setAttribute("aria-label", "Fermer le formulaire");
  closeBtn.innerHTML = CLOSE_SVG;
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const bar = head.querySelector<HTMLElement>(".wiz-progress__bar")!;
  const count = head.querySelector<HTMLElement>(".wiz-count")!;

  // Le <form> devient le corps flex de la modale
  panel.appendChild(form);

  // Zone défilable centrée (contient les étapes)
  const scroll = document.createElement("div");
  scroll.className = "wiz-scroll";
  // Laisse la molette/trackpad scroller ce conteneur au lieu d'être capturée par Lenis (page publique).
  scroll.setAttribute("data-lenis-prevent", "");
  const inner = document.createElement("div");
  inner.className = "wiz-scroll__inner";
  steps.forEach((s) => inner.appendChild(s));
  scroll.appendChild(inner);
  form.insertBefore(scroll, form.firstChild);

  // Pied épinglé : erreur + navigation + statut + note
  const foot = document.createElement("div");
  foot.className = "wiz-foot";
  const errorEl = document.createElement("p");
  errorEl.className = "wizard-error";
  errorEl.setAttribute("role", "alert");

  const nav = document.createElement("div");
  nav.className = "wizard-nav";
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "btn btn-outline wizard-prev";
  prevBtn.innerHTML = ARROW_BACK + "<span>Précédent</span>";
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "btn btn-primary wizard-next";
  nextBtn.innerHTML = "<span>Suivant</span>" + ARROW_FWD;
  nav.append(prevBtn, nextBtn);
  if (submitBtn) nav.appendChild(submitBtn);

  foot.appendChild(errorEl);
  foot.appendChild(nav);
  if (status) foot.appendChild(status);
  if (note) foot.appendChild(note);
  form.appendChild(foot);

  // .form-success déplacé comme frère du form (forms.ts le retrouve)
  if (success) panel.appendChild(success);

  document.body.appendChild(modal);

  /* ---------- Bouton « Démarrer » sur la page ---------- */
  const launch = document.createElement("div");
  launch.className = "wiz-launch";
  const cta = form.getAttribute("data-wizard-cta") || "Commencer";
  launch.innerHTML =
    `<span class="wiz-launch__badge">${total} étapes · ~3 min</span>` +
    `<button type="button" class="btn btn-primary wiz-open">${cta} ${ARROW_FWD}</button>` +
    `<p class="wiz-launch__hint">Un parcours guidé, une question à la fois — sans prise de tête.</p>`;
  card?.appendChild(launch);
  const openBtn = launch.querySelector<HTMLButtonElement>(".wiz-open")!;

  /* ---------- Helpers d'état ---------- */
  function setError(msg: string): void {
    errorEl.textContent = msg;
    errorEl.classList.toggle("is-visible", Boolean(msg));
  }
  function clearInvalidGroups(): void {
    form.querySelectorAll<HTMLElement>(".wizard-fieldset.is-invalid").forEach((fs) => fs.classList.remove("is-invalid"));
  }
  function firstInvalid(step: HTMLElement): FieldEl | null {
    let bad: FieldEl | null = null;
    step.querySelectorAll<FieldEl>("[required]").forEach((field) => {
      const invalid = isBad(field, form);
      field.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (invalid) {
        if (field instanceof HTMLInputElement && field.type === "radio") field.closest(".wizard-fieldset")?.classList.add("is-invalid");
        if (!bad) bad = field;
      }
    });
    return bad;
  }
  function messageFor(field: FieldEl): string {
    if (field instanceof HTMLInputElement) {
      if (field.type === "radio") return "Merci de choisir une option pour continuer.";
      if (field.type === "email" && field.value.trim()) return "Merci de saisir une adresse e-mail valide.";
    }
    return "Merci de compléter ce champ pour continuer.";
  }

  /* ---------- Affichage d'une étape ---------- */
  function show(index: number, dir: Dir): void {
    current = index;
    const active = steps[index];
    steps.forEach((s, i) => {
      const on = i === index;
      s.classList.toggle("is-active", on);
      if (on) s.removeAttribute("hidden");
      else { s.setAttribute("hidden", ""); s.classList.remove("is-anim"); }
    });

    bar.style.width = ((index + 1) / total) * 100 + "%";
    const label = active.dataset.stepTitle ? " · " + active.dataset.stepTitle : "";
    count.textContent = `Étape ${index + 1} / ${total}${label}`;

    prevBtn.hidden = index === 0;
    const last = index === total - 1;
    nextBtn.hidden = last;
    if (submitBtn) submitBtn.hidden = !last;
    if (note) note.hidden = !last; // la note d'info n'apparaît qu'à la dernière étape

    setError("");
    scroll.scrollTop = 0;

    if (dir !== "init" && !prefersReduced()) {
      active.style.setProperty("--wiz-from", dir === "prev" ? "-24px" : "24px");
      active.classList.remove("is-anim");
      void active.offsetWidth;
      active.classList.add("is-anim");
    }
    if (dir !== "init") firstFocusable(active)?.focus({ preventScroll: true });
  }

  /* ---------- Navigation ---------- */
  function goNext(): void {
    const bad = firstInvalid(steps[current]);
    if (bad) {
      setError(messageFor(bad));
      if (bad instanceof HTMLInputElement && bad.type === "radio") {
        (form.querySelector<HTMLInputElement>(`input[name="${bad.name}"]`) || bad).focus();
      } else bad.focus();
      return;
    }
    if (current < total - 1) show(current + 1, "next");
  }
  function goPrev(): void { if (current > 0) show(current - 1, "prev"); }

  nextBtn.addEventListener("click", goNext);
  prevBtn.addEventListener("click", goPrev);

  form.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.tagName === "BUTTON") return;
    e.preventDefault();
    if (current === total - 1) form.requestSubmit();
    else goNext();
  });

  form.addEventListener("input", () => setError(""));
  form.addEventListener("change", (e) => {
    setError("");
    clearInvalidGroups();
    const step = steps[current];
    const target = e.target as HTMLElement;
    if (step.hasAttribute("data-wizard-auto") && step.contains(target) && !firstInvalid(step) && current < total - 1) {
      window.setTimeout(() => { if (current === steps.indexOf(step)) show(current + 1, "next"); }, prefersReduced() ? 0 : 320);
    }
  });

  /* ---------- Ouverture / fermeture ---------- */
  let lastFocus: HTMLElement | null = null;
  function open(): void {
    lastFocus = document.activeElement as HTMLElement;
    modal.hidden = false;
    document.documentElement.classList.add("wiz-lock");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    show(current, "init");
    window.setTimeout(() => (firstFocusable(steps[current]) || closeBtn).focus({ preventScroll: true }), prefersReduced() ? 0 : 120);
  }
  function close(): void {
    modal.classList.remove("is-open");
    document.documentElement.classList.remove("wiz-lock");
    const done = () => { modal.hidden = true; };
    if (prefersReduced()) done(); else window.setTimeout(done, 260);
    lastFocus?.focus?.();
  }
  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  modal.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Escape") { close(); return; }
    if (e.key !== "Tab") return;
    // Piège à focus simple
    const f = Array.from(modal.querySelectorAll<HTMLElement>(
      'a[href], button:not([hidden]):not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
    )).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const firstEl = f[0], lastEl = f[f.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
  });

  show(0, "init");
}
