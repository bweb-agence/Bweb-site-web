export const prerender = false;

/* =========================================================
   BWEB ACADEMY — Inscription au webinaire
   -----------------------------------------------------------
   Reçoit le formulaire de /webinaire-initiation et transmet le lead à
   l'Edge Function `ingest` d'ACQ Hub (point d'entrée unique des tunnels :
   identité résolue, timeline append-only, idempotence, DLQ).

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
 */
function normalizeWhatsapp(v: unknown): string {
  if (typeof v !== "string") return "";
  const raw = v.trim();
  const plus = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return "";
  if (plus) return "+" + digits;
  return "+225" + digits.replace(/^0+/, "");
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

  const ingestKey = import.meta.env.TUNNEL_INGEST_KEY;
  const ingestUrl = import.meta.env.INGEST_URL;

  if (!ingestKey || !ingestUrl) {
    // Configuration incomplète : on le trace côté serveur, et le client bascule
    // sur WhatsApp plutôt que de perdre le prospect (même contrat que contact.ts).
    console.error("[webinaire] ingestion non configurée (TUNNEL_INGEST_KEY / INGEST_URL absents)");
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
      return json({ ok: false, error: "ingest_failed" });
    }
    return json({ ok: true });
  } catch (err) {
    console.error("[webinaire] ingest injoignable", err);
    return json({ ok: false, error: "ingest_unreachable" });
  }
};
