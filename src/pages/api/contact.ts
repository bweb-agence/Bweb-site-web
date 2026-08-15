export const prerender = false;

/* =========================================================
   BWEB AGENCE — Endpoint de collecte de leads (Contact & Devis)
   -----------------------------------------------------------
   Route serveur Astro (nécessite output: "hybrid" + adaptateur Vercel).
   Reçoit la soumission du formulaire (FormData), la fiabilise, puis :
     1. ENREGISTRE la soumission + le contact (src/lib/leads.ts) — avant tout
        envoi, pour qu'une panne e-mail ne fasse plus disparaître le lead.
     2. Notification de lead vers la boîte Bweb (BWEB_INBOX) via Bird.
     3. Accusé de réception au client.
   Sert TOUS les formulaires `<form data-form>` du site (contact, devis, et les
   suivants) : le champ caché `form_key` les distingue dans l'admin.
   Protections : honeypot, validation, limite de débit best-effort par IP.
   Renvoie { ok:false, error:"not_configured" } (HTTP 200) si Bird n'est pas
   configuré → le client bascule proprement sur WhatsApp (même contrat que
   src/pages/api/reserver.ts).
   ========================================================= */
import type { APIRoute } from "astro";
import { sendEmail } from "../../lib/email";
import { createAdminClient } from "../../lib/supabaseAdmin";
import { markRelay, payloadFromFormData, recordSubmission, utmFromFormData } from "../../lib/leads";
import { BUCKET, SIGNED_DOWNLOAD_TTL } from "../../lib/uploads";

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
/** Chemin d'un Referer, sans jamais lever : une en-tête douteuse ne doit pas
    faire échouer la soumission (le catch global renverrait une erreur 500). */
const pathOf = (url: string | null): string | undefined => {
  if (!url) return undefined;
  try { return new URL(url).pathname; } catch { return undefined; }
};

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
      const skip = new Set(["_subject", "subject", "message", "phone_cc", "company_site", "_honey", "attachments"]);
      const parts: string[] = [];
      for (const [k, v] of fd.entries()) {
        if (skip.has(k) || v instanceof File) continue;
        const val = String(v).trim();
        if (val) parts.push(`• ${k} : ${val}`);
      }
      summary = parts.join("\n");
    }

    const summaryHtml = esc(summary).replace(/\n/g, "<br>");

    // Pièces jointes : le client les a téléversées directement vers Supabase
    // (URLs signées) et nous transmet la liste des chemins. On regénère des
    // liens de téléchargement signés (30 j) pour l'e-mail de notification.
    let attachmentsHtml = "";
    let attachmentList: Array<{ path?: string; name?: string }> = [];
    try {
      const raw = get("attachments");
      const list: Array<{ path?: string; name?: string }> = raw ? JSON.parse(raw) : [];
      const clean = list
        .filter((a) => a?.path && !a.path.includes("..") && !a.path.startsWith("/"))
        .slice(0, 20);
      attachmentList = clean;
      if (clean.length) {
        const svcKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
        if (svcKey && svcKey !== "A_COMPLETER") {
          const admin = createAdminClient();
          const items: string[] = [];
          for (const a of clean) {
            const { data } = await admin.storage.from(BUCKET).createSignedUrl(a.path!, SIGNED_DOWNLOAD_TTL);
            const label = esc(a.name || a.path!.split("/").pop() || "fichier");
            items.push(
              data?.signedUrl
                ? `<li style="margin:4px 0"><a href="${esc(data.signedUrl)}" style="color:#1f6ced">${label}</a></li>`
                : `<li style="margin:4px 0">${label} (lien indisponible)</li>`,
            );
          }
          attachmentsHtml = `<div style="font-size:13px;color:#3f4568;margin-top:16px"><b>Pièces jointes (${clean.length}) — liens valables 30&nbsp;jours</b><ul style="margin:6px 0 0;padding-left:18px">${items.join("")}</ul></div>`;
        } else {
          attachmentsHtml = `<div style="font-size:13px;color:#b4690e;margin-top:16px">${clean.length} pièce(s) jointe(s) signalée(s) mais stockage non configuré.</div>`;
        }
      }
    } catch { /* pièces jointes best-effort — n'affecte jamais le lead */ }

    // 1) Enregistrement AVANT tout envoi. C'est ce qui change tout : jusqu'ici un
    // lead Contact ou Devis n'existait que dans une boîte e-mail — Bird en panne
    // ou mal configuré et le prospect disparaissait. Désormais la soumission est
    // en base quoi qu'il arrive, l'e-mail n'est plus qu'une notification.
    const submission = await recordSubmission({
      formKey: get("form_key") || "contact",
      formTitle: subject,
      pagePath: get("page_path") || pathOf(request.headers.get("referer")),
      fullName: name,
      email,
      phone,
      company: get("company"),
      message: summary,
      payload: payloadFromFormData(fd),
      attachments: attachmentList,
      utm: utmFromFormData(fd),
      referrer: request.headers.get("referer") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
      ip,
    });

    // 2) Notification de lead vers Bweb (répondre au client via son e-mail affiché).
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
      ${attachmentsHtml}
    </div>`);
    const notifOk = await sendEmail({ to: inbox, subject: `Lead — ${subject}`, html: notif, text: summary });
    await markRelay(submission?.submissionId, {
      target: "bird",
      status: notifOk ? "sent" : "failed",
      error: notifOk ? undefined : "notification Bird non envoyée",
    });

    // Bird non configuré → le client bascule sur WhatsApp (contrat reserver.ts).
    // La soumission, elle, est déjà enregistrée : le lead n'est plus perdu.
    if (!notifOk) return json({ ok: false, error: "not_configured" });

    // 3) Accusé de réception au client (best-effort, n'affecte pas le statut).
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
