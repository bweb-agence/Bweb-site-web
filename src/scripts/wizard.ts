/* =========================================================
   BWEB AGENCE — Assistant multi-étapes (type Typeform)
   -----------------------------------------------------------
   Enveloppe les champs du formulaire de Contact dans un parcours
   guidé : barre de progression, navigation Précédent/Suivant,
   validation par étape, transitions douces.

   Progressive enhancement — le module :
     • ne s'active QUE sur <form data-wizard> (page Contact) ;
     • n'altère rien sans JS : toutes les étapes restent visibles
       et la soumission native reste gérée par forms.ts ;
     • ne touche PAS à la logique d'envoi : la dernière étape
       déclenche simplement la soumission normale du <form>
       (bouton submit ou Entrée → forms.ts compose WhatsApp +
       e-mail + affiche .form-success).

   Le respect de prefers-reduced-motion est assuré à la fois ici
   (pas d'animation JS déclenchée) et globalement en CSS.
   ========================================================= */

type FieldEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Dir = "next" | "prev" | "init";

const prefersReduced = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ARROW_BACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="20" y1="12" x2="4" y2="12"/><polyline points="10 18 4 12 10 6"/></svg>';
const ARROW_FWD =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/></svg>';

/** Premier champ focusable d'une étape (pour l'accessibilité). */
function firstFocusable(step: HTMLElement): FieldEl | null {
  return step.querySelector<FieldEl>(
    'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
  );
}

/** Un champ requis est-il « vide » / invalide ? (aligné sur forms.ts, + e-mail). */
function isBad(field: FieldEl, form: HTMLFormElement): boolean {
  if (field instanceof HTMLInputElement && field.type === "radio") {
    return !form.querySelector(`input[name="${field.name}"]:checked`);
  }
  const value = (field.value || "").trim();
  if (!value) return true;
  if (field instanceof HTMLInputElement && field.type === "email") {
    return !field.checkValidity();
  }
  return false;
}

export function initWizard(): void {
  const formEl = document.querySelector<HTMLFormElement>("form[data-wizard]");
  if (!formEl) return;
  // Référence au type non-null pour que le narrowing survive dans les closures.
  const form: HTMLFormElement = formEl;

  const steps = Array.from(form.querySelectorAll<HTMLElement>("[data-wizard-step]"));
  if (steps.length < 2) return; // rien à segmenter

  const total = steps.length;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  let current = 0;

  // Active le mode segmenté (les règles .wizard-on masquent les étapes inactives).
  form.classList.add("wizard-on");

  /* ---------- En-tête : progression + compteur ---------- */
  const head = document.createElement("div");
  head.className = "wizard-head";
  head.innerHTML =
    '<div class="wizard-progress" role="presentation"><span class="wizard-progress__bar"></span></div>' +
    '<p class="wizard-count" aria-live="polite"></p>';
  form.insertBefore(head, steps[0]);
  const bar = head.querySelector<HTMLElement>(".wizard-progress__bar")!;
  const count = head.querySelector<HTMLElement>(".wizard-count")!;

  /* ---------- Navigation : Précédent / Suivant (+ submit déplacé) ---------- */
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
  if (submitBtn) nav.appendChild(submitBtn); // déplacé dans la barre de navigation

  const errorEl = document.createElement("p");
  errorEl.className = "wizard-error";
  errorEl.setAttribute("role", "alert");

  const status = form.querySelector(".form-status");
  form.insertBefore(errorEl, status);
  form.insertBefore(nav, status);

  /* ---------- Helpers d'état ---------- */
  function setError(msg: string): void {
    errorEl.textContent = msg;
    errorEl.classList.toggle("is-visible", Boolean(msg));
  }

  function clearInvalidGroups(): void {
    form
      .querySelectorAll<HTMLElement>(".wizard-fieldset.is-invalid")
      .forEach((fs) => fs.classList.remove("is-invalid"));
  }

  /** Valide les champs requis de l'étape ; renvoie le 1er champ fautif. */
  function firstInvalid(step: HTMLElement): FieldEl | null {
    let bad: FieldEl | null = null;
    step.querySelectorAll<FieldEl>("[required]").forEach((field) => {
      const invalid = isBad(field, form);
      field.setAttribute("aria-invalid", invalid ? "true" : "false");
      if (invalid) {
        if (field instanceof HTMLInputElement && field.type === "radio") {
          field.closest(".wizard-fieldset")?.classList.add("is-invalid");
        }
        if (!bad) bad = field;
      }
    });
    return bad;
  }

  function messageFor(field: FieldEl): string {
    if (field instanceof HTMLInputElement) {
      if (field.type === "radio") return "Merci de choisir une option pour continuer.";
      if (field.type === "email" && field.value.trim())
        return "Merci de saisir une adresse e-mail valide.";
    }
    return "Merci de compléter ce champ pour continuer.";
  }

  /** Remonte le formulaire dans le viewport s'il est masqué par l'en-tête fixe. */
  function keepInView(): void {
    const card = (form.closest(".form-card") as HTMLElement) || form;
    const rect = card.getBoundingClientRect();
    const headerH = 96;
    if (rect.top < headerH) {
      const y = window.scrollY + rect.top - headerH;
      window.scrollTo({ top: y, behavior: prefersReduced() ? "auto" : "smooth" });
    }
  }

  /* ---------- Affichage d'une étape ---------- */
  function show(index: number, dir: Dir): void {
    current = index;
    const active = steps[index];

    steps.forEach((s, i) => {
      const on = i === index;
      s.classList.toggle("is-active", on);
      if (on) s.removeAttribute("hidden");
      else s.setAttribute("hidden", "");
      if (!on) s.classList.remove("is-anim");
    });

    // Progression + compteur (annoncé via aria-live).
    bar.style.width = ((index + 1) / total) * 100 + "%";
    const label = active.dataset.stepTitle ? " · " + active.dataset.stepTitle : "";
    count.textContent = `Étape ${index + 1} / ${total}${label}`;

    // Boutons contextuels.
    prevBtn.hidden = index === 0;
    const last = index === total - 1;
    nextBtn.hidden = last;
    if (submitBtn) submitBtn.hidden = !last;

    setError("");

    // Transition douce (désactivée si mouvement réduit).
    if (dir !== "init" && !prefersReduced()) {
      active.style.setProperty("--wiz-from", dir === "prev" ? "-24px" : "24px");
      active.classList.remove("is-anim");
      void active.offsetWidth; // force le reflow pour relancer l'animation
      active.classList.add("is-anim");
    }

    // Accessibilité : focus sur le 1er champ (sauf au chargement initial).
    if (dir !== "init") {
      keepInView();
      firstFocusable(active)?.focus({ preventScroll: true });
    }
  }

  /* ---------- Navigation ---------- */
  function goNext(): void {
    const bad = firstInvalid(steps[current]);
    if (bad) {
      setError(messageFor(bad));
      if (bad instanceof HTMLInputElement && bad.type === "radio") {
        (form.querySelector<HTMLInputElement>(`input[name="${bad.name}"]`) || bad).focus();
      } else {
        bad.focus();
      }
      return;
    }
    if (current < total - 1) show(current + 1, "next");
  }

  function goPrev(): void {
    if (current > 0) show(current - 1, "prev");
  }

  nextBtn.addEventListener("click", goNext);
  prevBtn.addEventListener("click", goPrev);

  /* ---------- Entrée = étape suivante (submit natif sur la dernière) ---------- */
  form.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.tagName === "BUTTON") return; // saut de ligne / clic natif
    e.preventDefault();
    if (current === total - 1) form.requestSubmit();
    else goNext();
  });

  /* ---------- Nettoyage des états d'erreur à la saisie ---------- */
  form.addEventListener("input", () => setError(""));
  form.addEventListener("change", (e) => {
    setError("");
    clearInvalidGroups();

    // Auto-avance sur les étapes à sélection unique (ex. choix du service).
    const step = steps[current];
    const target = e.target as HTMLElement;
    if (
      step.hasAttribute("data-wizard-auto") &&
      step.contains(target) &&
      !firstInvalid(step) &&
      current < total - 1
    ) {
      window.setTimeout(() => {
        if (current === steps.indexOf(step)) show(current + 1, "next");
      }, prefersReduced() ? 0 : 320);
    }
  });

  /* ---------- Démarrage ---------- */
  show(0, "init");
}
