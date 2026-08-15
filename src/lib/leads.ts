/* =========================================================
   BWEB AGENCE — Capture des soumissions de formulaire (socle acquisition)
   -----------------------------------------------------------
   Point d'entrée unique : tout formulaire du site passe par `recordSubmission()`,
   qui enregistre la soumission BRUTE (form_submissions), résout ou crée le
   contact (contacts, dédupliqué sur e-mail OU téléphone) et écrit l'événement
   correspondant dans la timeline (contact_events).

   RÈGLE ABSOLUE : cette fonction ne fait JAMAIS échouer un formulaire.
   Elle avale ses erreurs et renvoie `null`. Un incident base ou une variable
   d'environnement manquante ne doit pas empêcher un prospect de nous joindre —
   l'e-mail, le relais ACQ Hub et le repli WhatsApp continuent leur chemin.
   C'est le pendant de ce que faisait déjà `sync_customer_from_booking()` en SQL
   (« la synchro CRM ne doit jamais faire échouer une réservation »).

   Écriture avec la clé service : les tables du socle n'ont aucune policy
   d'insertion, donc rien ne peut y écrire depuis le navigateur.
   ========================================================= */
import { createHash } from "node:crypto";
import { createAdminClient } from "./supabaseAdmin";
import { secret } from "./env";

/** Type d'événement inscrit dans la timeline du contact. */
export type LeadEventType = "soumission" | "webinaire_inscrit";

export interface LeadRelay {
  /** Système destinataire du relais (ex. « acq_hub »). */
  target: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

export interface LeadInput {
  /** Identifiant stable du formulaire : contact, devis, webinaire-initiation, lead-… */
  formKey: string;
  /** Libellé affiché du formulaire (repris tel quel dans l'admin). */
  formTitle?: string;
  /** Page d'où part la soumission (« /contact »). */
  pagePath?: string;
  fullName?: string;
  email?: string;
  /** Brut ou E.164 : la normalisation est faite en SQL (normalize_phone). */
  phone?: string;
  company?: string;
  /** Récapitulatif lisible, affiché en aperçu dans la liste des soumissions. */
  message?: string;
  /** Tous les champs soumis. Un nouveau formulaire n'exige aucune migration. */
  payload?: Record<string, unknown>;
  attachments?: unknown[];
  utm?: Record<string, string>;
  referrer?: string;
  userAgent?: string;
  /** IP brute : jamais stockée telle quelle, uniquement son empreinte. */
  ip?: string;
  eventType?: LeadEventType;
  /** Titre de l'événement dans la timeline (défaut : le titre du formulaire). */
  eventTitle?: string;
  relay?: LeadRelay;
}

export interface LeadResult {
  submissionId: string;
  contactId: string | null;
}

/* ---------- Empreinte d'IP ----------
   L'IP sert à qualifier un abus (rafales, bots), pas à identifier une personne.
   On n'en garde qu'un condensé salé : inexploitable en cas de fuite, mais
   suffisant pour rapprocher deux soumissions de la même origine. */
function hashIp(ip: string): string | null {
  const clean = (ip || "").trim();
  if (!clean || clean === "0.0.0.0" || clean === "unknown") return null;
  const salt = secret("LEAD_IP_SALT") || "bweb-acquisition";
  return createHash("sha256").update(salt + clean).digest("hex").slice(0, 32);
}

const trim = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Enregistre une soumission, rattache le contact, écrit la timeline.
 * Ne lève jamais. Renvoie `null` si l'enregistrement n'a pas pu se faire.
 */
export async function recordSubmission(input: LeadInput): Promise<LeadResult | null> {
  try {
    const admin = createAdminClient();

    const email = trim(input.email, 160)?.toLowerCase() || null;
    const phone = trim(input.phone, 40);
    const fullName = trim(input.fullName, 160);
    const company = trim(input.company, 160);

    // Sans e-mail ni téléphone, on garde tout de même la soumission (elle est
    // consultable dans l'admin) mais aucun contact ne peut être identifié.
    let contactId: string | null = null;
    if (email || phone) {
      const { data, error } = await admin.rpc("resolve_contact", {
        p_email: email,
        p_phone: phone,
        p_name: fullName,
        p_company: company,
        p_source: input.formKey,
        p_utm: input.utm && Object.keys(input.utm).length ? input.utm : null,
      });
      if (error) throw error;
      contactId = (data as string) || null;
    }

    const { data: sub, error: subErr } = await admin
      .from("form_submissions")
      .insert({
        contact_id: contactId,
        form_key: input.formKey,
        form_title: trim(input.formTitle, 200),
        page_path: trim(input.pagePath, 300),
        full_name: fullName,
        email,
        phone,
        message: typeof input.message === "string" ? input.message.slice(0, 8000) : null,
        payload: input.payload ?? {},
        attachments: input.attachments ?? [],
        utm: input.utm ?? {},
        referrer: trim(input.referrer, 500),
        user_agent: trim(input.userAgent, 400),
        ip_hash: input.ip ? hashIp(input.ip) : null,
        relay_target: input.relay?.target ?? null,
        relay_status: input.relay?.status ?? null,
        relay_error: input.relay?.error ? input.relay.error.slice(0, 500) : null,
      })
      .select("id")
      .single();
    if (subErr) throw subErr;

    // Timeline : best-effort séparé. Une soumission enregistrée sans son
    // événement reste exploitable ; l'inverse serait un fantôme.
    if (contactId) {
      const { error: evErr } = await admin.from("contact_events").insert({
        contact_id: contactId,
        type: input.eventType || "soumission",
        title: input.eventTitle || input.formTitle || input.formKey,
        source: input.formKey,
        submission_id: sub.id,
        dedupe_key: `submission:${sub.id}`,
        meta: { page: input.pagePath ?? null, utm: input.utm ?? {} },
      });
      if (evErr) console.error("[leads] événement non enregistré", evErr.message);
    }

    return { submissionId: sub.id as string, contactId };
  } catch (err) {
    // Jamais de propagation : le formulaire doit aboutir même si le socle tombe.
    console.error("[leads] soumission non enregistrée —", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Note l'issue du relais externe sur une soumission déjà enregistrée.
 *
 * L'ordre compte : on enregistre TOUJOURS avant de relayer, pour qu'une panne du
 * destinataire (Bird, ACQ Hub) ne fasse pas disparaître le lead. Le statut est
 * donc renseigné après coup — et son échec n'a lui-même aucune conséquence.
 */
export async function markRelay(submissionId: string | null | undefined, relay: LeadRelay): Promise<void> {
  if (!submissionId) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("form_submissions")
      .update({
        relay_target: relay.target,
        relay_status: relay.status,
        relay_error: relay.error ? relay.error.slice(0, 500) : null,
      })
      .eq("id", submissionId);
  } catch (err) {
    console.error("[leads] statut de relais non enregistré —", err instanceof Error ? err.message : err);
  }
}

/* ---------- Extraction depuis un FormData ----------
   Les formulaires assistés du site (`<form data-form>`, cf. src/scripts/forms.ts)
   postent l'intégralité de leurs champs. On les reprend TOUS dans `payload` :
   c'est ce qui permet d'ajouter un champ, ou un formulaire entier, sans toucher
   ni au schéma ni à l'admin. */
const PAYLOAD_IGNORE = new Set([
  "company_site", "_honey", "website",      // honeypots
  "attachments", "utm", "_subject",
]);

/** Transforme un FormData en objet exploitable (les clés répétées deviennent des listes). */
export function payloadFromFormData(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of fd.entries()) {
    if (PAYLOAD_IGNORE.has(key) || value instanceof File) continue;
    const str = String(value).trim();
    if (!str) continue;
    const prev = out[key];
    if (prev === undefined) out[key] = str.slice(0, 2000);
    else if (Array.isArray(prev)) (prev as string[]).push(str.slice(0, 2000));
    else out[key] = [prev as string, str.slice(0, 2000)];
  }
  return out;
}

/** Lit les paramètres d'attribution (utm_*) postés en champs cachés. */
export function utmFromFormData(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = fd.get(key);
    if (typeof v === "string" && v.trim()) out[key.replace("utm_", "")] = v.trim().slice(0, 200);
  }
  return out;
}
