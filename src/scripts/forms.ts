/* =========================================================
   BWEB AGENCE — Formulaires : WhatsApp + e-mail
   -----------------------------------------------------------
   À la soumission d'un <form data-form> :
     1. Association label/champ garantie (accessibilité).
     2. Validation accessible (aria-invalid + message annoncé).
     3. Composition d'un message structuré à partir des champs.
     4. Envoi e-mail vers info@bwebagence.com si un endpoint est
        configuré (forms.emailEndpoint dans src/config/site.ts).
     5. Ouverture de WhatsApp (numéro principal) avec le message
        pré-rempli — canal fiable, fonctionne sans backend.
     6. État de succès inline avec lien WhatsApp de secours.
   ========================================================= */
import { contact, forms as formsCfg } from "../config/site";

type FieldEl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const wa = (msg: string, number: string = contact.whatsapp.primary) =>
  `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;

const clean = (s: string) =>
  s.replace(/\*/g, "").replace(/\(optionnel\)/gi, "").replace(/\s+/g, " ").trim();

/* ---------- Association label <-> champ (a11y, tous formulaires) ---------- */
let uid = 0;
function associateLabels(form: HTMLFormElement): void {
  form.querySelectorAll<HTMLElement>(".field").forEach((field) => {
    const controls = field.querySelectorAll<FieldEl>("input, select, textarea");
    if (controls.length !== 1) return; // groupes radio/checkbox : gérés par label englobant
    const control = controls[0];
    const label = field.querySelector("label:not(:has(input))") as HTMLLabelElement | null;
    if (!label || label.htmlFor) return;
    if (!control.id) control.id = `f-${++uid}`;
    label.htmlFor = control.id;
  });
}

/* ---------- Libellé de groupe (legend / label du .field) ---------- */
function groupLabel(control: FieldEl): string {
  const field = control.closest("fieldset, .field");
  const lg = field?.querySelector("legend, label");
  return clean(lg?.textContent || control.name);
}
function optionText(control: HTMLInputElement): string {
  const wrap = control.closest("label");
  return clean(wrap?.textContent || control.value);
}

/* ---------- Composition du message WhatsApp / e-mail ---------- */
function composeMessage(form: HTMLFormElement): string {
  const title = form.getAttribute("data-form-title") || "Nouvelle demande";
  const lines: string[] = [`*${title}*`, ""];
  const doneCheckboxGroups = new Set<string>();
  const doneRadioGroups = new Set<string>();
  // Indicatif pays (fusionné au numéro, pas affiché seul).
  const cc = form.querySelector<HTMLSelectElement>('[name="phone_cc"]')?.value || "";

  form.querySelectorAll<FieldEl>("input, select, textarea").forEach((control) => {
    const name = (control as HTMLInputElement).name;
    const type = (control as HTMLInputElement).type;
    if (!name || type === "submit" || type === "button" || type === "file") return;
    if (name === "phone_cc") return; // fusionné au champ téléphone

    if (type === "radio") {
      if (doneRadioGroups.has(name)) return;
      const checked = form.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
      if (!checked) return;
      doneRadioGroups.add(name);
      lines.push(`• ${groupLabel(control)} : ${optionText(checked)}`);
      return;
    }
    if (type === "checkbox") {
      if (doneCheckboxGroups.has(name)) return;
      doneCheckboxGroups.add(name);
      const checked = Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`));
      if (!checked.length) return;
      lines.push(`• ${groupLabel(control)} : ${checked.map(optionText).join(", ")}`);
      return;
    }
    const value = control.value.trim();
    if (!value) return;
    const label = clean(control.closest(".field")?.querySelector("label")?.textContent || name);
    const out = name === "phone" && cc ? `${cc} ${value}` : value;
    lines.push(`• ${label} : ${out}`);
  });

  return lines.join("\n");
}

function validate(form: HTMLFormElement): boolean {
  let ok = true;
  form.querySelectorAll<HTMLInputElement>("[required]").forEach((field) => {
    let empty: boolean;
    if (field.type === "radio") {
      empty = !form.querySelector(`input[name="${field.name}"]:checked`);
    } else {
      empty = !field.value || !field.value.trim();
    }
    field.setAttribute("aria-invalid", empty ? "true" : "false");
    if (empty && ok) field.focus();
    if (empty) ok = false;
  });
  return ok;
}

function setStatus(form: HTMLFormElement, msg: string, kind: "error" | "success" | "") {
  const status = form.querySelector<HTMLElement>(".form-status");
  if (!status) return;
  status.textContent = msg;
  status.classList.remove("error", "success");
  if (kind) status.classList.add(kind);
}

async function sendEmail(form: HTMLFormElement): Promise<boolean> {
  const endpoint = formsCfg.emailEndpoint;
  if (!endpoint) return false; // non configuré -> on s'appuie sur WhatsApp
  const fd = new FormData(form);
  // Champs de contrôle FormSubmit (ignorés par Formspree) — ajoutés hors DOM
  // pour ne PAS polluer le récapitulatif WhatsApp.
  fd.append("_subject", form.getAttribute("data-form-title") || "Nouvelle demande — Bweb");
  fd.append("_template", "table");
  fd.append("_captcha", "false");
  if (!fd.has("_honey")) fd.append("_honey", "");
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      body: fd,
      headers: { Accept: "application/json" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function showSuccess(form: HTMLFormElement, waUrl: string, emailOk: boolean) {
  const success = form.parentElement?.querySelector<HTMLElement>(".form-success");
  if (!success) {
    setStatus(
      form,
      emailOk
        ? "Merci ! Votre demande a bien été envoyée par e-mail."
        : "Cliquez sur « Prévenir sur WhatsApp » pour nous transmettre votre demande.",
      "success",
    );
    return;
  }
  const link = success.querySelector<HTMLAnchorElement>("[data-wa-fallback]");
  if (link) link.href = waUrl;
  // Si l'e-mail n'a pas pu partir, WhatsApp devient le canal d'envoi (mis en avant).
  if (!emailOk) {
    const t = success.querySelector<HTMLElement>("[data-success-title]");
    if (t) t.textContent = "Dernière étape pour nous l'envoyer";
    const m = success.querySelector<HTMLElement>("[data-success-msg]");
    if (m) m.textContent = "Cliquez ci-dessous pour nous transmettre votre récapitulatif sur WhatsApp.";
    success.querySelector<HTMLElement>("[data-success-optional]")?.setAttribute("hidden", "");
    link?.classList.remove("btn-whatsapp");
    link?.classList.add("btn-primary");
  }
  success.classList.add("is-visible");
  form.style.display = "none";
}

export function initForms(): void {
  document.querySelectorAll<HTMLFormElement>("form[data-form]").forEach((form) => {
    form.setAttribute("novalidate", "");
    associateLabels(form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!validate(form)) {
        setStatus(form, "Merci de remplir tous les champs obligatoires (*).", "error");
        return;
      }
      setStatus(form, "Envoi en cours…", "");

      const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      submitBtn?.classList.add("is-loading");

      // Canal principal = e-mail. WhatsApp devient une option (bouton dans
      // l'écran de succès) pour prévenir/transmettre — plus d'ouverture auto.
      const waUrl = wa(composeMessage(form));
      const emailOk = await sendEmail(form);
      submitBtn?.classList.remove("is-loading");
      setStatus(form, "", "");
      showSuccess(form, waUrl, emailOk);
    });

    form.querySelectorAll<HTMLInputElement>("[required]").forEach((field) => {
      const evt = field.type === "radio" ? "change" : "input";
      field.addEventListener(evt, () => field.setAttribute("aria-invalid", "false"));
    });
  });
}
