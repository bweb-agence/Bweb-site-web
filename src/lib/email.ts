/* =========================================================
   BWEB — Envoi d'e-mails transactionnels via le SDK officiel Bird
   (@messagebird/sdk → POST /v1/email/messages, région déduite de la clé).
   Nécessite : clé API Bird + domaine expéditeur vérifié (mail.bwebagence.com).
   Silencieux si non configuré (renvoie false).
   ========================================================= */
import { BirdClient } from "@messagebird/sdk";

const SITE = "https://www.bwebagence.com";

type EmailAttachment = { filename: string; content: string; type?: string };
type EmailOpts = { to: string; subject: string; html: string; text?: string; attachments?: EmailAttachment[] };

export async function sendEmail(opts: EmailOpts): Promise<boolean> {
  const key = import.meta.env.BIRD_API_KEY || import.meta.env.BIRD_ACCESS_KEY;
  const from = import.meta.env.BIRD_FROM || "Bweb Agence <no-reply@mail.bwebagence.com>";
  const replyTo = import.meta.env.BIRD_REPLY_TO || "info@bwebagence.com";
  if (!key || key === "A_COMPLETER") return false;
  try {
    const bird = new BirdClient({ apiKey: key });
    const msg: any = await bird.email.send({
      from,
      to: [opts.to],
      ...(replyTo ? { reply_to: [replyTo] } : {}),
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      category: "transactional",
    } as any);
    return msg?.status === "accepted" || !!msg?.id;
  } catch {
    return false;
  }
}

/* ---------- Gabarit de marque (compatible clients mail) ---------- */
function shell(inner: string): string {
  return `<div style="background:#eef2fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(2,11,80,.08)">
    <div style="background:#050a3a;padding:20px 22px;text-align:center">
      <img src="${SITE}/images/logo-email.png" alt="Bweb Agence" width="149" height="30" style="height:30px;width:149px;display:inline-block;border:0;outline:none;text-decoration:none" />
    </div>
    ${inner}
    <div style="background:#f8faff;padding:18px 22px;text-align:center;color:#8b91ae;font-size:12px;line-height:1.6;border-top:1px solid #eef2fb">
      Bweb Agence · Cocody, Abidjan · +225 07 01 92 60 28<br>Une question ? Répondez simplement à cet e-mail.
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e8edf9">
        <a href="${SITE}/conditions-generales" style="color:#1f6ced;text-decoration:none;font-weight:700">Conditions générales (CGV)</a>
        &nbsp;·&nbsp;
        <a href="${SITE}/politique-confidentialite" style="color:#1f6ced;text-decoration:none;font-weight:700">Politique de confidentialité</a>
        &nbsp;·&nbsp;
        <a href="${SITE}/mentions-legales" style="color:#1f6ced;text-decoration:none;font-weight:700">Mentions légales</a>
      </div>
    </div>
  </div>
</div>`;
}

type BookingEmail = {
  reference: string;
  full_name: string;
  session_title: string;
  session_date?: string | null;
  session_venue?: string | null;
  ticket_name?: string | null;
  quantity?: number;
  amount?: number;
  balance?: number;
  pdf_url?: string | null;
};

const firstName = (n: string) => (n || "").trim().split(" ")[0] || n;
const fmt = (n?: number) => (Number(n) || 0).toLocaleString("fr-FR") + " F CFA";
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/* Accusé de réception (à la création de la réservation) */
export function ackEmail(b: BookingEmail) {
  return {
    subject: `Nous avons bien reçu votre inscription — ${b.reference}`,
    html: shell(`<div style="padding:22px">
      <p style="font-size:15px;color:#3f4568;margin:0 0 12px">Bonjour ${esc(firstName(b.full_name))},</p>
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 12px">
        Votre demande d'inscription à <b>« ${esc(b.session_title)} »</b> (réf. <b>${esc(b.reference)}</b>) est bien enregistrée.
        Votre place est réservée ; notre équipe vérifie votre paiement et vous confirme par e-mail sous 24 h.</p>
      <p style="font-size:14px;color:#3f4568;margin:0">À très vite,<br>L'équipe Bweb Agence</p>
    </div>`),
  };
}

/* Gabarit e-mail marketing / campagne : message libre de l'admin (texte
   multi-lignes → paragraphes HTML, URLs cliquables) + lien de désabonnement
   obligatoire (conformité). */
export function campaignEmailHtml(message: string, unsubUrl: string): string {
  const linkify = (t: string) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1f6ced;font-weight:700">$1</a>');
  const body = esc(message)
    .split(/\n{2,}/)
    .map((p) => `<p style="font-size:15px;color:#3f4568;line-height:1.65;margin:0 0 14px">${linkify(p.replace(/\n/g, "<br>"))}</p>`)
    .join("");
  return shell(`<div style="padding:24px">
    ${body}
    <p style="font-size:14px;color:#3f4568;margin:14px 0 0">L'équipe Bweb Agence</p>
    <p style="font-size:11px;color:#aab0c8;margin:22px 0 0;padding-top:14px;border-top:1px solid #eef2fb">
      Vous recevez cet e-mail car vous avez déjà interagi avec Bweb Agence.
      <a href="${unsubUrl}" style="color:#8b91ae;text-decoration:underline">Se désabonner en un clic</a>.
    </p>
  </div>`);
}

/* Variante « corps HTML riche » (modèle composé dans l'éditeur) : on injecte le
   HTML tel quel dans le gabarit de marque + lien de désabonnement. */
export function campaignEmailFromHtml(bodyHtml: string, unsubUrl: string): string {
  return shell(`<div style="padding:24px;font-size:15px;color:#3f4568;line-height:1.65">
    <div class="rich">${bodyHtml}</div>
    <p style="font-size:11px;color:#aab0c8;margin:22px 0 0;padding-top:14px;border-top:1px solid #eef2fb">
      Vous recevez cet e-mail car vous avez déjà interagi avec Bweb Agence.
      <a href="${unsubUrl}" style="color:#8b91ae;text-decoration:underline">Se désabonner en un clic</a>.
    </p>
  </div>`);
}

/* Une ligne d'information dans le corps du billet (label / valeur). */
function ticketRow(k: string, v: string) {
  return `<tr>
    <td style="padding:5px 0;font-size:12px;color:#8b94c8;white-space:nowrap;vertical-align:top">${k}</td>
    <td style="padding:5px 0 5px 12px;font-size:12.5px;color:#ffffff;font-weight:700;text-align:right;vertical-align:top">${v}</td>
  </tr>`;
}

/* Confirmation (paiement Money Fusion vérifié ou validé par un admin).
   Billet façon ticket d'événement. Gère le paiement total ET l'acompte 50 %. */
export function confirmationEmail(b: BookingEmail) {
  const isDeposit = Number(b.balance) > 0;
  const accent = isDeposit ? "#f0a500" : "#00c89e"; // ambre (acompte) / menthe (payé)

  const heroTitle = isDeposit ? "Place réservée&nbsp;!" : "Inscription confirmée&nbsp;!";
  const heroSub = isDeposit ? "Ton acompte a bien été reçu." : "Ton paiement a bien été vérifié.";

  // Bandeau de statut dans le billet.
  const payLabel = isDeposit ? "Acompte · 50 %" : "Payé";
  const band = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px">
      <tr><td style="border:1px solid ${accent};border-radius:11px;padding:11px 13px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:700;white-space:nowrap">${payLabel}</td>
          <td align="right" style="font-family:'Courier New',monospace;font-size:16px;font-weight:700;color:#ffffff;white-space:nowrap;padding-left:10px">${fmt(b.amount)}</td>
        </tr></table>
      </td></tr>
    </table>`;

  const soldeNote = isDeposit
    ? `<div style="margin:9px 2px 0;font-size:11px;color:#f0a500;line-height:1.5">⚠ Solde de <b>${fmt(b.balance)}</b> à régler sur place le jour J.</div>`
    : `<div style="margin:9px 2px 0;font-size:11px;color:#8b94c8;line-height:1.5">Rien à régler sur place. Un rappel te sera envoyé la veille.</div>`;

  // Le billet : corps (infos) + talon (référence = code d'entrée).
  const ticket = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" background="${SITE}/images/billet-bg.png" bgcolor="#050a3a" style="border-collapse:separate;border-radius:16px;overflow:hidden;background:#050a3a url('${SITE}/images/billet-bg.png') center center / cover no-repeat">
    <tr>
      <td style="padding:18px 16px;vertical-align:top">
        <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${accent};font-weight:700">— Billet de formation</div>
        <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-.01em;margin:9px 0 2px;line-height:1.25">${esc(b.session_title)}</div>
        ${b.ticket_name ? `<div style="color:#aeb8ec;font-size:12px;margin-bottom:12px">${esc(b.quantity || 1)}× ${esc(b.ticket_name)}</div>` : `<div style="height:6px"></div>`}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${b.session_date ? ticketRow("Date", esc(b.session_date)) : ""}
          ${b.session_venue ? ticketRow("Lieu", esc(b.session_venue)) : ""}
          ${ticketRow("Participant", esc(b.full_name))}
        </table>
        ${band}
        ${soldeNote}
      </td>
      <td width="126" style="width:126px;padding:16px 10px;vertical-align:middle;text-align:center;border-left:2px dashed rgba(255,255,255,.35)">
        <img src="${SITE}/api/billet-qr?ref=${encodeURIComponent(b.reference)}" width="86" height="86" alt="QR ${esc(b.reference)}" style="display:block;margin:0 auto 8px;width:86px;height:86px;background:#fff;border-radius:8px;padding:5px" />
        <div style="font-family:'Courier New',monospace;font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:${accent};font-weight:700">Code d'entrée</div>
        <div style="font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:#ffffff;letter-spacing:.03em;margin:5px 0 4px">${esc(b.reference)}</div>
        <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:#8b94c8">Admis · 1</div>
      </td>
    </tr>
  </table>`;

  return {
    subject: isDeposit
      ? `Place réservée · acompte reçu — ${b.reference}`
      : `Inscription confirmée · votre billet — ${b.reference}`,
    html: shell(`<div style="padding:24px 22px 6px;text-align:center">
      <div style="width:56px;height:56px;border-radius:50%;background:${accent};color:#fff;font-size:30px;line-height:56px;margin:0 auto 10px">&#10003;</div>
      <div style="font-size:19px;font-weight:800;color:#0a0e27">${heroTitle}</div>
      <div style="font-size:13px;color:#565d80;margin-top:4px">${heroSub}</div>
    </div>
    <div style="padding:12px 18px 22px">
      <p style="font-size:13.5px;color:#3f4568;line-height:1.6;margin:0 0 14px">Bonjour ${esc(firstName(b.full_name))}, ta place est réservée. Voici ton billet — présente le code d'entrée à l'accueil le jour&nbsp;J.</p>
      ${ticket}
      ${
        b.pdf_url
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr><td align="center">
              <a href="${b.pdf_url}" style="display:inline-block;background:#1f6ced;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;border-radius:11px">↓&nbsp; Télécharger mon billet (PDF)</a>
            </td></tr></table>`
          : ""
      }
      <p style="font-size:11.5px;color:#8b91ae;line-height:1.5;margin:14px 4px 0;text-align:center">Ton billet est aussi joint en PDF à cet e-mail. Code <b>${esc(b.reference)}</b> à présenter à l'accueil (scan du QR).</p>
    </div>`),
  };
}
