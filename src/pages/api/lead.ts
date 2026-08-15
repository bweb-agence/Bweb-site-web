export const prerender = false;

/* =========================================================
   BWEB AGENCE — Capture générique (pages de capture / lead magnets)
   -----------------------------------------------------------
   Endpoint prévu pour les tunnels à venir : landing d'un lead magnet, page
   d'inscription à un webinaire, formulaire court en bas d'une page de vente.
   Un seul champ décide de tout : `form_key` — il identifie le formulaire dans
   l'admin, sans code ni migration supplémentaire.

   Contrat volontairement identique à /api/contact et /api/webinaire/inscription
   (HTTP 200 + { ok } sauf abus), pour que le repli WhatsApp du client fonctionne
   partout de la même façon :
     { ok: true, id }              → soumission enregistrée
     { ok: false, error: "..." }   → le client affiche le message adapté

   Accepte JSON ou FormData. Champs reconnus : form_key (requis), form_title,
   page_path, prenom/nom/fullname, email, phone/whatsapp, phone_cc, message,
   utm_* ; tout le reste part dans `payload` et reste consultable dans l'admin.

   Ce qu'il ne fait PAS : envoyer un e-mail. Une page de capture a sa propre
   suite (redirection vers une page de remerciement, séquence dans ACQ Hub) ;
   on ne la présume pas ici.
   ========================================================= */
import type { APIRoute } from "astro";
import { recordSubmission } from "../../lib/leads";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/* ---------- Limite de débit best-effort (par instance serverless) ----------
   Même approche que api/contact.ts et api/webinaire/inscription.ts : ne
   remplace pas un rate-limit distribué, mais coupe les soumissions en rafale. */
const WINDOW_MS = 60_000;
const MAX_HITS = 6;
const HITS = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 500) HITS.delete(HITS.keys().next().value as string); // borne mémoire
  return arr.length > MAX_HITS;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s);
/** Un lien dans un champ d'identité = bot. Signal simple et efficace. */
const containsUrl = (s: string) => /https?:\/\/|www\.|\.[a-z]{2,}\//i.test(s);

/** Champs de structure : utiles au traitement, inutiles dans le payload. */
const RESERVED = new Set([
  "form_key", "form_title", "page_path", "website", "company_site", "_honey",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
]);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || clientAddress || "unknown";
  if (rateLimited(ip)) return json({ ok: false, error: "rate_limited" }, 429);

  let body: Record<string, unknown>;
  try {
    const ct = request.headers.get("content-type") || "";
    body = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const str = (k: string, max = 200): string => {
    const v = body[k];
    return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
  };

  // Honeypot : on répond ok pour que le bot croie avoir réussi et n'insiste pas.
  if (str("website") || str("company_site")) return json({ ok: true });

  const formKey = str("form_key", 60);
  if (!formKey || !/^[a-z0-9][a-z0-9-]{1,58}$/i.test(formKey)) {
    return json({ ok: false, error: "form_key_invalide" }, 400);
  }

  const name = str("fullname") || str("nom") || str("prenom") || str("name");
  const email = str("email", 160).toLowerCase();
  // L'indicatif vient d'un <select name="phone_cc"> (cf. PhoneField) ; le champ
  // peut aussi contenir un numéro international complet, auquel cas il prime.
  const cc = str("phone_cc", 8);
  const rawPhone = str("whatsapp", 40) || str("phone", 40);
  const phone = !rawPhone ? "" : /^(\+|00)/.test(rawPhone) ? rawPhone : `${cc} ${rawPhone}`.trim();

  // Au moins un moyen de recontact, sinon la soumission ne sert à rien.
  if (!email && !phone) return json({ ok: false, error: "contact_requis" });
  if (email && !isEmail(email)) return json({ ok: false, error: "email_invalide" });
  if (name && containsUrl(name)) return json({ ok: false, error: "nom_invalide" });

  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const v = str(k);
    if (v) utm[k.replace("utm_", "")] = v;
  }

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (RESERVED.has(k) || typeof v !== "string") continue;
    const val = v.trim();
    if (val) payload[k] = val.slice(0, 2000);
  }

  const submission = await recordSubmission({
    formKey,
    formTitle: str("form_title") || formKey,
    pagePath: str("page_path", 300),
    fullName: name,
    email,
    phone,
    message: str("message", 4000),
    payload,
    utm,
    referrer: request.headers.get("referer") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    ip,
  });

  // Le socle est indisponible (base injoignable, clé manquante) : on le dit au
  // client, qui bascule sur son repli — plutôt que de prétendre avoir gardé un
  // lead qu'on a perdu.
  if (!submission) return json({ ok: false, error: "not_configured" });

  return json({ ok: true, id: submission.submissionId });
};
