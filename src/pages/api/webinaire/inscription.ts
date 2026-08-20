export const prerender = false;

/* =========================================================
   BWEB ACADEMY — Inscription au webinaire
   -----------------------------------------------------------
   Reçoit le formulaire de /webinaire-initiation, ENREGISTRE l'inscription dans
   la base du site (src/lib/leads.ts) puis transmet le lead à l'Edge Function
   `ingest` d'ACQ Hub (point d'entrée unique des tunnels : identité résolue,
   timeline append-only, idempotence, DLQ).

   L'ordre n'est pas anodin : le relais est un appel réseau vers un autre projet.
   Tant qu'il était seul dépositaire du lead, une panne (ou une variable
   manquante) faisait disparaître l'inscrit — le formulaire basculait sur
   WhatsApp et rien n'était conservé. Le site garde désormais sa propre trace,
   et `form_submissions.relay_status` dit si ACQ Hub l'a bien reçue.

   Pourquoi une route serveur plutôt qu'un appel direct depuis le navigateur :
   la clé `x-tunnel-key` est un SECRET. Exposée côté client, n'importe qui
   pourrait injecter de faux leads dans le CRM. Elle ne quitte donc jamais
   le serveur. Bénéfice annexe : l'appel est same-origin, donc rien à
   ajouter dans la CSP de vercel.json.

   Contrat de réponse (toujours HTTP 200 sauf abus) :
     { ok: true }                  → lead accepté, le client redirige
     { ok: false, error: "..." }   → le client affiche le message adapté
   ========================================================= */
import type { APIRoute } from "astro";
import { markRelay, recordSubmission } from "../../../lib/leads";
import { envoyerConfirmationWebinaire } from "../../../lib/webinaireEmails";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/* ---------- Limite de débit best-effort (par instance serverless) ----------
   Même approche que src/pages/api/contact.ts : ne remplace pas un vrai
   rate-limit distribué, mais coupe les soumissions en rafale. */
const WINDOW_MS = 60_000;
const MAX_HITS = 5;
const HITS = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 500) HITS.delete(HITS.keys().next().value as string); // borne mémoire
  return arr.length > MAX_HITS;
}

/* ---------- Normalisation ---------- */

/** Prénom : espaces compactés, longueur bornée. */
function cleanPrenom(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

/**
 * WhatsApp → E.164. Les visiteurs saisissent aussi bien « 07 01 92 60 28 »
 * que « +225 0701926028 ». Sans indicatif explicite on préfixe la Côte
 * d'Ivoire (+225), marché principal ; les autres pays saisissent le leur.
 *
 * On NE retire PAS le 0 initial : depuis le passage à 10 chiffres (2021), il
 * fait partie du numéro ivoirien — 07 01 92 60 28 donne +225 07 01 92 60 28.
 * Le réflexe de le supprimer vient de la France, où c'est un préfixe
 * interurbain. Le numéro de Bweb le confirme : contact.whatsapp.primary vaut
 * « 2250701926028 ». L'enlever produisait un numéro à 9 chiffres, injoignable
 * sur WhatsApp — et un lead silencieusement perdu.
 */
function normalizeWhatsapp(v: unknown): string {
  if (typeof v !== "string") return "";
  const raw = v.trim();
  const plus = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return "";
  if (plus) return "+" + digits;
  return "+225" + digits;
}

function isWhatsappValid(e164: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(e164);
}

function isEmailValid(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v);
}

/** Un lien dans le prénom = bot. Signal simple et efficace. */
function containsUrl(v: string): boolean {
  return /https?:\/\/|www\.|\.[a-z]{2,}\//i.test(v);
}

/* ---------- Lecture des secrets, à l'exécution ----------
   Volontairement `process.env` et non `import.meta.env` : ce dernier est
   remplacé par sa valeur à la COMPILATION. Si la variable manque au moment
   du build, Vite écrit `undefined` et l'élimination de code mort supprime
   tout l'appel à ACQ Hub qui suit — la route répond alors `not_configured`
   pour toujours, même une fois la variable renseignée dans Vercel, et il
   faut redéployer pour s'en rendre compte. Vérifié : le bundle passe de
   3 642 à 2 634 octets et perd son `fetch`. En prime, `import.meta.env`
   inscrit la clé en clair dans l'artefact déployé.

   `import.meta.env` reste consulté en second, en accès DYNAMIQUE — Vite ne
   remplace que les accès littéraux (`import.meta.env.FOO`), donc la clé
   variable échappe à l'inlining et au code mort. C'est ce qui fait marcher
   le test en local : le serveur de dev charge les fichiers `.env` dans
   `import.meta.env` et non dans `process.env`.

   Plusieurs noms acceptés : le premier renseigné gagne. Permet de renommer
   une variable dans Vercel sans casser la production entre-temps. */
function secret(...noms: string[]): string {
  const runtime = globalThis.process?.env ?? {};
  const build = import.meta.env as Record<string, string | undefined>;
  for (const nom of noms) {
    const valeur = runtime[nom] || build[nom];
    if (valeur) return valeur;
  }
  return "";
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress || "0.0.0.0";
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

  // Honeypot : on répond ok pour que le bot croie avoir réussi et n'insiste pas.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true });
  }

  const prenom = cleanPrenom(body.prenom);
  const whatsapp = normalizeWhatsapp(body.whatsapp);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 160) : "";

  if (prenom.length < 2 || containsUrl(prenom)) return json({ ok: false, error: "prenom_invalide" });
  if (!isWhatsappValid(whatsapp)) return json({ ok: false, error: "whatsapp_invalide" });
  if (!isEmailValid(email)) return json({ ok: false, error: "email_invalide" });

  /* Enregistrement local AVANT le relais. ACQ Hub reste le CRM d'acquisition,
     mais il est joignable par le réseau : s'il tombe, le formulaire bascule sur
     WhatsApp et l'inscrit n'existait jusqu'ici nulle part. Le site garde donc sa
     propre trace de tout ce qui est soumis chez lui. Best-effort : la fonction
     n'échoue jamais et ne bloque pas l'inscription. */
  const submission = await recordSubmission({
    formKey: "webinaire-initiation",
    formTitle: "Inscription webinaire — Initiation",
    pagePath: "/webinaire-initiation",
    fullName: prenom,
    email,
    phone: whatsapp,
    message: `Inscription au webinaire du 6 septembre 2026 — ${prenom}`,
    payload: { prenom, email, whatsapp, evenement: "webinaire-initiation-2026-09-06" },
    utm: typeof body.utm_source === "string" || typeof body.utm_campaign === "string"
      ? Object.fromEntries(
          ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
            .map((k) => [k.replace("utm_", ""), typeof body[k] === "string" ? (body[k] as string).slice(0, 200) : ""])
            .filter(([, v]) => v),
        )
      : undefined,
    referrer: request.headers.get("referer") || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    ip,
    eventType: "webinaire_inscrit",
    eventTitle: "Inscrit au webinaire Initiation (6 septembre 2026)",
  });

  /* Confirmation par e-mail, AVANT le relais : c'est le seul message que
     l'inscrit reçoit tout de suite, et il ne doit pas dépendre de la santé
     d'ACQ Hub. La fonction tient son propre journal anti-doublon (une deuxième
     soumission de la même adresse ne renvoie rien) et ne lève jamais. */
  const confirmation = await envoyerConfirmationWebinaire({
    email,
    prenom,
    contactId: submission?.contactId,
  });
  if (confirmation === "echec" || confirmation === "webinaire_inconnu") {
    // Tracé côté serveur seulement : l'inscription, elle, a bien eu lieu et le
    // visiteur n'a rien à faire de cette information.
    console.error(`[webinaire] confirmation non envoyée à ${email} (${confirmation})`);
  }

  const ingestKey = secret("TUNNEL_KEY_WEBINAIRE_INITIATION", "TUNNEL_INGEST_KEY");
  const ingestUrl = secret("INGEST_URL");

  if (!ingestKey || !ingestUrl) {
    // Configuration incomplète : on le trace côté serveur, et le client bascule
    // sur WhatsApp plutôt que de perdre le prospect (même contrat que contact.ts).
    // Le détail dit laquelle manque — sinon on cherche à l'aveugle en prod.
    // L'inscription, elle, est déjà enregistrée en base juste au-dessus.
    console.error(
      "[webinaire] ingestion non configurée —" +
        (ingestKey ? "" : " TUNNEL_KEY_WEBINAIRE_INITIATION absente") +
        (ingestUrl ? "" : " INGEST_URL absente"),
    );
    await markRelay(submission?.submissionId, {
      target: "acq_hub",
      status: "skipped",
      error: "relais non configuré",
    });
    return json({ ok: false, error: "not_configured" });
  }

  /* Idempotence : une même personne qui soumet deux fois (double-clic, retour
     arrière) ne doit pas créer deux leads. La clé est stable par identité. */
  const idempotencyKey = `webinaire-initiation:lead:${whatsapp || email}`;

  try {
    const res = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tunnel-key": ingestKey },
      body: JSON.stringify({
        v: 1,
        idempotency_key: idempotencyKey,
        tunnel: "webinaire-initiation",
        step: "inscription",
        type: "lead_captured",
        occurred_at: new Date().toISOString(),
        contact: { phone: whatsapp, email, first_name: prenom },
        payload: {
          source: "webinaire",
          evenement: "webinaire-initiation-2026-09-06",
          page: "/webinaire-initiation",
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[webinaire] ingest a refusé le lead (${res.status}) ${detail.slice(0, 200)}`);
      await markRelay(submission?.submissionId, {
        target: "acq_hub",
        status: "failed",
        error: `HTTP ${res.status} ${detail.slice(0, 200)}`,
      });
      return json({ ok: false, error: "ingest_failed" });
    }
    await markRelay(submission?.submissionId, { target: "acq_hub", status: "sent" });
    return json({ ok: true });
  } catch (err) {
    console.error("[webinaire] ingest injoignable", err);
    await markRelay(submission?.submissionId, {
      target: "acq_hub",
      status: "failed",
      error: err instanceof Error ? err.message : "ingest injoignable",
    });
    return json({ ok: false, error: "ingest_unreachable" });
  }
};
