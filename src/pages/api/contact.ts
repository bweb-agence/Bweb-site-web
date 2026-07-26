export const prerender = false;

/* =========================================================
   BWEB AGENCE — Endpoint de collecte de leads (Contact & Devis)
   -----------------------------------------------------------
   Route serveur Astro (nécessite output: "hybrid" + adaptateur Vercel).
   Reçoit la soumission du formulaire (FormData), la fiabilise puis envoie
   par e-mail via Bird (@messagebird/sdk, cf. src/lib/email.ts) :
     1. Notification de lead vers la boîte Bweb (BWEB_INBOX).
     2. Accusé de réception au client.
   Protections : honeypot, validation, limite de débit best-effort par IP.
   Renvoie { ok:false, error:"not_configured" } (HTTP 200) si Bird n'est pas
   configuré → le client bascule proprement sur WhatsApp (même contrat que
   src/pages/api/reserver.ts).
   ========================================================= */
import type { APIRoute } from "astro";
import { sendEmail } from "../../lib/email";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/* ---------- Limite de débit best-effort (par instance serverless) ---------- */
const HITS = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 500) HITS.delete(HITS.keys().next().value as string); // borne mémoire
  return arr.length > MAX_PER_WINDOW;
}

/* ---------- Utilitaires ---------- */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const firstName = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

/* Gabarit de marque (aligné sur src/lib/email.ts, autonome). */
function shell(inner: string): string {
  return `<div style="background:#eef2fb;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(2,11,80,.08)">
    <div style="background:#020b50;padding:22px;text-align:center">
      <div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-.02em">Bweb Agence</div>
    </div>
    ${inner}
    <div style="background:#f8faff;padding:16px 22px;text-align:center;color:#8b91ae;font-size:12px;line-height:1.6">
      Bweb Agence · Cocody, Abidjan · +225 07 01 92 60 28
    </div>
  </div>
</div>`;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || clientAddress || "unknown";
    if (rateLimited(ip)) return json({ ok: false, error: "rate_limited" }, 429);

    const fd = await request.formData();

    // Honeypot : un vrai humain ne remplit jamais ce champ (masqué). Si rempli,
    // on fait comme si tout s'était bien passé (on jette silencieusement).
    if (((fd.get("company_site") as string) || "").trim()) return json({ ok: true });

    const get = (k: string) => ((fd.get(k) as string) || "").trim();
    const name = get("fullname") || get("name") || get("nom");
    const email = get("email");
    const cc = get("phone_cc");
    const phoneRaw = get("phone");
    const phone = phoneRaw ? (cc ? `${cc} ${phoneRaw}` : phoneRaw) : "";
    const subject = get("subject") || get("_subject") || "Nouvelle demande — Bweb";
    // Récapitulatif humain composé côté client (sinon reconstruit ci-dessous).
    let summary = get("message");

    if (!email || !isEmail(email)) return json({ ok: false, error: "invalid_email" }, 400);
    if (!name) return json({ ok: false, error: "invalid" }, 400);

    // Repli : reconstruire un récap si le client n'a pas fourni `message`.
    if (!summary) {
      const skip = new Set(["_subject", "subject", "message", "phone_cc", "company_site", "_honey"]);
      const parts: string[] = [];
      for (const [k, v] of fd.entries()) {
        if (skip.has(k) || v instanceof File) continue;
        const val = String(v).trim();
        if (val) parts.push(`• ${k} : ${val}`);
      }
      summary = parts.join("\n");
    }

    const summaryHtml = esc(summary).replace(/\n/g, "<br>");

    // 1) Notification de lead vers Bweb (répondre au client via son e-mail affiché).
    const inbox = import.meta.env.BWEB_INBOX || "info@bwebagence.com";
    const notif = shell(`<div style="padding:22px">
      <div style="font-size:11px;letter-spacing:.1em;color:#1f6ced;font-weight:700;text-transform:uppercase;margin-bottom:6px">Nouveau lead</div>
      <div style="font-size:17px;font-weight:800;color:#0a0e27;margin-bottom:14px">${esc(subject)}</div>
      <div style="border:1px solid rgba(31,108,237,.15);border-radius:12px;padding:14px 16px;background:#f4f8ff;font-size:13px;color:#3f4568;line-height:1.6">
        <div><b>Nom</b> : ${esc(name)}</div>
        <div><b>E-mail</b> : <a href="mailto:${esc(email)}">${esc(email)}</a></div>
        ${phone ? `<div><b>Téléphone</b> : ${esc(phone)}</div>` : ""}
      </div>
      <div style="font-size:13px;color:#3f4568;line-height:1.7;margin-top:14px">${summaryHtml}</div>
    </div>`);
    const notifOk = await sendEmail({ to: inbox, subject: `Lead — ${subject}`, html: notif, text: summary });

    // Bird non configuré → le client bascule sur WhatsApp (contrat reserver.ts).
    if (!notifOk) return json({ ok: false, error: "not_configured" });

    // 2) Accusé de réception au client (best-effort, n'affecte pas le statut).
    const ack = shell(`<div style="padding:22px">
      <p style="font-size:15px;color:#3f4568;margin:0 0 12px">Bonjour ${esc(firstName(name)) || "et merci"},</p>
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 12px">
        Nous avons bien reçu votre demande. Notre équipe l'étudie et revient vers vous très vite,
        généralement sous 24&nbsp;h ouvrées.</p>
      <p style="font-size:14px;color:#3f4568;margin:0">À très vite,<br>L'équipe Bweb Agence</p>
    </div>`);
    await sendEmail({ to: email, subject: "Nous avons bien reçu votre demande — Bweb Agence", html: ack });

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "server" }, 500);
  }
};
