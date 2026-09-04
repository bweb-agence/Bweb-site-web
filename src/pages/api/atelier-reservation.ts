export const prerender = false;

/* =========================================================
   BWEB AGENCE — Réservation d'appel découverte « Atelier Stratégie IA »
   -----------------------------------------------------------
   Sert le formulaire en 5 étapes de /atelier-strategie-ia. Même contrat que
   /api/contact (HTTP 200 + { ok }), pour que le repli WhatsApp de forms.ts
   fonctionne à l'identique : `{ ok:false }` fait basculer le client sur
   WhatsApp au lieu de perdre la demande.

   L'ordre est celui de /api/contact, et pour la même raison : on ENREGISTRE
   avant de notifier. Bird en panne ne doit pas faire disparaître un dirigeant
   qui vient de remplir cinq étapes.

     1. honeypot          → 200 { ok:true } silencieux (le bot croit avoir réussi)
     2. score SERVEUR     → A/B/C, jamais celui du client (cf. `calculerScore`)
     3. form_submissions  → payload + score, via la clé service
        + contacts / contact_events (type `reservation`) — dans recordSubmission
     4. e-mail Bird       → notification interne : niveau en objet, rappel en un clic
     5. accusé de réception au demandeur

   L'e-mail est le SEUL canal d'alerte (décision Godwin du 29/08/2026) : la
   boîte info@bwebagence.com est déjà relevée, un second canal à maintenir ne
   rapportait rien.
   ========================================================= */
import type { APIRoute } from "astro";
import { sendEmail } from "../../lib/email";
import { markRelay, payloadFromFormData, recordSubmission, utmFromFormData } from "../../lib/leads";
import { MAX_DOULEURS, calculerScore } from "../../lib/qualification";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/* ---------- Limite de débit best-effort (par instance serverless) ----------
   Identique à /api/contact : ne remplace pas un rate-limit distribué, mais
   coupe les rafales d'un même client. */
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

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s);
const firstName = (n: string) => (n || "").trim().split(/\s+/)[0] || "";

/* ---------- Gabarit d'e-mail (aligné sur /api/contact) ---------- */
function shell(inner: string): string {
  return `<div style="background:#eef2fb;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(2,11,80,.08)">
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

/** Numéro au format wa.me (chiffres uniquement) — vide si inexploitable. */
function waNumber(phone: string): string {
  const chiffres = phone.replace(/\D/g, "");
  return chiffres.length >= 8 ? chiffres : "";
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || clientAddress || "unknown";
    if (rateLimited(ip)) return json({ ok: false, error: "rate_limited" }, 429);

    const fd = await request.formData();

    // Honeypot : champ masqué qu'un humain ne voit pas. Rempli = bot. On répond
    // « ok » pour qu'il n'insiste pas, et on ne garde rien.
    if (((fd.get("company_site") as string) || "").trim()) return json({ ok: true });

    const get = (k: string) => ((fd.get(k) as string) || "").trim();
    const getAll = (k: string) =>
      fd.getAll(k).map((v) => String(v).trim()).filter(Boolean);

    const name = get("full_name") || get("fullname");
    const email = get("email").toLowerCase();
    const cc = get("phone_cc");
    const phoneRaw = get("phone");
    const phone = phoneRaw ? (/^(\+|00)/.test(phoneRaw) ? phoneRaw : `${cc} ${phoneRaw}`.trim()) : "";
    const company = get("company");

    if (!email || !isEmail(email)) return json({ ok: false, error: "invalid_email" }, 400);
    if (!name) return json({ ok: false, error: "invalid" }, 400);

    /* Le plafond de 2 douleurs est appliqué à l'écran (cases désactivées) ; il
       est REAPPLIQUÉ ici, parce qu'une requête forgée ne passe pas par l'écran
       et gonflerait le score de 3 points gratuits. */
    const pain = getAll("pain").slice(0, MAX_DOULEURS);
    const callGoal = getAll("call_goal").slice(0, MAX_DOULEURS);
    const callSlot = getAll("call_slot");

    const champs = {
      pain,
      pain_since: get("pain_since"),
      sector: get("sector"),
      company_size: get("company_size"),
      role: get("role"),
      past_invest: get("past_invest"),
      budget: get("budget"),
      call_goal: callGoal,
      call_question: get("call_question"),
      call_channel: get("call_channel"),
      call_slot: callSlot,
    };
    const qualification = calculerScore(champs);

    // Récapitulatif humain : celui composé par forms.ts si présent (il porte les
    // libellés affichés), sinon reconstruit depuis les champs connus.
    const summary =
      get("message") ||
      [
        `• Douleur : ${pain.join(", ") || "—"}`,
        `• Depuis : ${champs.pain_since || "—"}`,
        `• Secteur : ${champs.sector || "—"}`,
        `• Taille : ${champs.company_size || "—"}`,
        `• Rôle : ${champs.role || "—"}`,
        `• Déjà investi : ${champs.past_invest || "—"}`,
        `• Budget : ${champs.budget || "—"}`,
        `• Attentes de l'appel : ${callGoal.join(", ") || "—"}`,
        `• Question à préparer : ${champs.call_question || "—"}`,
        `• Canal : ${champs.call_channel || "—"}`,
        `• Créneau : ${callSlot.join(", ") || "—"}`,
      ].join("\n");

    /* 1) Enregistrement AVANT toute notification. Le score entre dans le
       payload : il est ainsi filtrable dans /admin/soumissions sans migration
       (form_submissions.payload est un JSONB). */
    const payload = {
      ...payloadFromFormData(fd),
      ...champs,
      score: qualification.score,
      score_level: qualification.niveau,
    };

    const submission = await recordSubmission({
      formKey: "atelier-strategie-ia",
      formTitle: "Réservation appel découverte — Atelier Stratégie IA",
      pagePath: get("page_path") || "/atelier-strategie-ia",
      fullName: name,
      email,
      phone,
      company,
      message: summary,
      payload,
      utm: utmFromFormData(fd),
      referrer: request.headers.get("referer") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
      ip,
      eventType: "reservation",
      eventTitle: `Appel découverte Atelier Stratégie IA — score ${qualification.niveau}`,
      eventMeta: {
        score: qualification.score,
        score_level: qualification.niveau,
        creneau: callSlot,
        canal: champs.call_channel,
      },
    });

    // 2) Notification interne par e-mail — le niveau est dans l'OBJET, pour se
    // repérer dans la liste des messages sans avoir à les ouvrir.
    const inbox = import.meta.env.BWEB_INBOX || "info@bwebagence.com";
    /* Rappeler en un clic depuis la notification : l'e-mail est le seul endroit
       où l'équipe voit ce lead, recopier un numéro à la main y coûterait une
       erreur de chiffre tôt ou tard. */
    const wa = waNumber(phone);
    const notif = shell(`<div style="padding:22px">
      <div style="font-size:11px;letter-spacing:.1em;color:#1f6ced;font-weight:700;text-transform:uppercase;margin-bottom:6px">Réservation d'appel · Atelier Stratégie IA</div>
      <div style="font-size:17px;font-weight:800;color:#0a0e27;margin-bottom:14px">Niveau ${qualification.niveau} — ${qualification.score}/10 · ${esc(qualification.delai)}</div>
      <div style="border:1px solid rgba(31,108,237,.15);border-radius:12px;padding:14px 16px;background:#f4f8ff;font-size:13px;color:#3f4568;line-height:1.6">
        <div><b>Nom</b> : ${esc(name)}</div>
        <div><b>Entreprise</b> : ${esc(company) || "—"}</div>
        <div><b>E-mail</b> : <a href="mailto:${esc(email)}">${esc(email)}</a></div>
        ${phone ? `<div><b>Téléphone</b> : ${esc(phone)}</div>` : ""}
        <div><b>Créneau souhaité</b> : ${esc(callSlot.join(", ")) || "—"}</div>
        <div><b>Canal</b> : ${esc(champs.call_channel) || "—"}</div>
      </div>
      ${wa ? `<div style="margin-top:16px"><a href="https://wa.me/${wa}" style="display:inline-block;background:#25d366;color:#fff;font-size:14px;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:999px">Rappeler sur WhatsApp</a></div>` : ""}
      <div style="font-size:13px;color:#3f4568;line-height:1.7;margin-top:14px">${esc(summary).replace(/\n/g, "<br>")}</div>
    </div>`);
    const notifOk = await sendEmail({
      to: inbox,
      subject: `[${qualification.niveau}] Réservation Atelier Stratégie IA — ${name}${company ? ` (${company})` : ""}`,
      html: notif,
      text: summary,
    });
    await markRelay(submission?.submissionId, {
      target: "bird",
      status: notifOk ? "sent" : "failed",
      error: notifOk ? undefined : "notification Bird non envoyée",
    });

    /* Bird non configuré ou en échec → le client bascule sur WhatsApp (contrat
       partagé avec /api/contact). La demande, elle, est déjà en base. */
    if (!notifOk) return json({ ok: false, error: "not_configured" });

    // 4) Accusé de réception au demandeur (best-effort : n'affecte pas le statut).
    const creneau = callSlot.length ? callSlot.join(" ou ") : "dès que possible";
    const ack = shell(`<div style="padding:22px">
      <p style="font-size:15px;color:#3f4568;margin:0 0 12px">Bonjour ${esc(firstName(name)) || "et merci"},</p>
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 12px">
        Votre demande d'appel découverte pour l'<b>Atelier Stratégie IA</b> est bien reçue.
        Nous vous rappelons sur le créneau que vous avez indiqué (<b>${esc(creneau)}</b>),
        par ${esc(champs.call_channel) || "téléphone"}.</p>
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 12px">
        L'appel dure une quinzaine de minutes : nous répondons à vos questions, nous
        vérifions ensemble que la journée correspond à votre situation, et nous vous
        réservons votre place s'il en reste.</p>
      <p style="font-size:14px;color:#3f4568;margin:0">À très vite,<br>L'équipe Bweb Agence</p>
    </div>`);
    await sendEmail({ to: email, subject: "Votre appel découverte — Atelier Stratégie IA", html: ack });

    return json({ ok: true });
  } catch {
    return json({ ok: false, error: "server" }, 500);
  }
};
