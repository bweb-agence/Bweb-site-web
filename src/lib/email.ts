/* =========================================================
   BWEB — Envoi d'e-mails transactionnels via le SDK officiel Bird
   (@messagebird/sdk → POST /v1/email/messages, région déduite de la clé).
   Nécessite : clé API Bird + domaine expéditeur vérifié (mail.bwebagence.com).
   Silencieux si non configuré (renvoie false).
   ========================================================= */
import { BirdClient } from "@messagebird/sdk";

type EmailOpts = { to: string; subject: string; html: string; text?: string };

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
      category: "transactional",
    } as any);
    return msg?.status === "accepted" || !!msg?.id;
  } catch {
    return false;
  }
}

/* ---------- Gabarit de marque (compatible clients mail) ---------- */
function shell(inner: string): string {
  return `<div style="background:#eef2fb;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(2,11,80,.08)">
    <div style="background:#020b50;padding:22px;text-align:center">
      <div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-.02em">Bweb Agence</div>
    </div>
    ${inner}
    <div style="background:#f8faff;padding:16px 22px;text-align:center;color:#8b91ae;font-size:12px;line-height:1.6">
      Bweb Agence · Cocody, Abidjan · +225 07 01 92 60 28<br>Une question ? Répondez simplement à cet e-mail.
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
};

const firstName = (n: string) => (n || "").trim().split(" ")[0] || n;
const fmt = (n?: number) => (Number(n) || 0).toLocaleString("fr-FR") + " F CFA";

/* Accusé de réception (à la création de la réservation) */
export function ackEmail(b: BookingEmail) {
  return {
    subject: `Nous avons bien reçu votre inscription — ${b.reference}`,
    html: shell(`<div style="padding:22px">
      <p style="font-size:15px;color:#3f4568;margin:0 0 12px">Bonjour ${firstName(b.full_name)},</p>
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 12px">
        Votre demande d'inscription à <b>« ${b.session_title} »</b> (réf. <b>${b.reference}</b>) est bien enregistrée.
        Votre place est réservée ; notre équipe vérifie votre paiement et vous confirme par e-mail sous 24 h.</p>
      <p style="font-size:14px;color:#3f4568;margin:0">À très vite,<br>L'équipe Bweb Agence</p>
    </div>`),
  };
}

/* Confirmation (quand l'admin valide le paiement) */
export function confirmationEmail(b: BookingEmail) {
  return {
    subject: `Inscription confirmée — ${b.session_title}`,
    html: shell(`<div style="padding:24px 22px;text-align:center">
      <div style="width:56px;height:56px;border-radius:50%;background:#00c89e;color:#fff;font-size:30px;line-height:56px;margin:0 auto 10px">&#10003;</div>
      <div style="font-size:18px;font-weight:800;color:#0a0e27">Inscription confirmée !</div>
      <div style="font-size:13px;color:#565d80;margin-top:4px">Votre paiement a bien été vérifié.</div>
    </div>
    <div style="padding:0 22px 22px">
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 14px">Bonjour ${firstName(b.full_name)}, votre place est confirmée. Voici votre billet :</p>
      <div style="border:2px dashed #1f6ced;border-radius:12px;padding:16px;background:#f4f8ff">
        <div style="font-size:11px;letter-spacing:.1em;color:#1f6ced;font-weight:700;text-transform:uppercase">Billet d'inscription</div>
        <div style="font-size:20px;font-weight:800;color:#020b50;letter-spacing:.05em;margin:4px 0 12px">${b.reference}</div>
        ${row("Formation", b.session_title)}
        ${b.session_date ? row("Date", b.session_date) : ""}
        ${b.session_venue ? row("Lieu", b.session_venue) : ""}
        ${b.ticket_name ? row("Tarif", `${b.quantity || 1}× ${b.ticket_name}`) : ""}
        ${b.amount ? row("Montant réglé", fmt(b.amount)) : ""}
      </div>
      <p style="font-size:12px;color:#8b91ae;line-height:1.5;margin:14px 0 0">Présentez ce code à l'accueil le jour J. Un rappel vous sera envoyé la veille.</p>
    </div>`),
  };
}

function row(k: string, v: string) {
  return `<div style="display:flex;justify-content:space-between;font-size:13px;color:#3f4568;padding:5px 0;border-top:1px solid rgba(31,108,237,.15)">
    <span>${k}</span><span style="font-weight:700;color:#0a0e27;text-align:right">${v}</span></div>`;
}
