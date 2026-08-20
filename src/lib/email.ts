/* =========================================================
   BWEB — Envoi d'e-mails transactionnels via le SDK officiel Bird
   (@messagebird/sdk → POST /v1/email/messages, région déduite de la clé).
   Nécessite : clé API Bird + domaine expéditeur vérifié (mail.bwebagence.com).
   Silencieux si non configuré (renvoie false).
   ========================================================= */
import { BirdClient } from "@messagebird/sdk";
import { secret } from "./env";

const SITE = "https://www.bwebagence.com";

// NB. Bird attend `content_type` (pas `type`) ; on accepte `type` en entrée par
// tolérance mais on sérialise toujours vers le contrat exact de Bird (sinon 422
// « champ inconnu » → l'envoi échoue et le billet ne part jamais).
type EmailAttachment = { filename: string; content: string; content_type?: string; type?: string; content_id?: string };
type EmailOpts = { to: string; subject: string; html: string; text?: string; attachments?: EmailAttachment[] };

export async function sendEmail(opts: EmailOpts): Promise<boolean> {
  /* Lecture À L'EXÉCUTION (cf. src/lib/env.ts). En accès littéral,
     `import.meta.env.BIRD_API_KEY` est remplacé par sa valeur au BUILD : une
     clé absente à ce moment-là devient `undefined` dans l'artefact, et plus
     aucun e-mail ne part — même une fois la variable renseignée. Constaté sur
     un déploiement de prévisualisation le 20/08/2026 : l'inscription au
     webinaire était enregistrée, sa confirmation n'atteignait jamais Bird.
     C'est le même piège que celui documenté pour le tunnel (PR #92/#93). */
  const key = secret("BIRD_API_KEY", "BIRD_ACCESS_KEY");
  /* Un expéditeur nommé, pas une marque : « Godwin Soola de Bweb Agence » est
     ce que le destinataire voit dans sa liste de messages, et une personne
     s'ouvre plus qu'une entreprise. L'adresse, elle, reste celle du domaine
     vérifié. La variable BIRD_FROM garde la main si elle est renseignée. */
  const from = secret("BIRD_FROM") || "Godwin Soola de Bweb Agence <no-reply@mail.bwebagence.com>";
  const replyTo = secret("BIRD_REPLY_TO") || "info@bwebagence.com";
  if (!key) return false;
  const attachments = opts.attachments?.length
    ? opts.attachments.map((a) => {
        const ct = a.content_type || a.type;
        return { filename: a.filename, content: a.content, ...(ct ? { content_type: ct } : {}), ...(a.content_id ? { content_id: a.content_id } : {}) };
      })
    : undefined;
  try {
    const bird = new BirdClient({ apiKey: key });
    const msg: any = await bird.email.send({
      from,
      to: [opts.to],
      ...(replyTo ? { reply_to: [replyTo] } : {}),
      subject: opts.subject,
      html: opts.html,
      ...(opts.text ? { text: opts.text } : {}),
      ...(attachments ? { attachments } : {}),
      category: "transactional",
    } as any);
    return msg?.status === "accepted" || !!msg?.id;
  } catch (e) {
    console.error("[sendEmail] échec Bird pour", opts.to, "—", (e as any)?.message || e);
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
  calendarGoogle?: string | null;
  calendarIcs?: string | null;
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
      ${b.calendarGoogle && b.calendarIcs ? `<div style="text-align:center;font-size:12px;color:#8b91ae;margin-top:16px">Ajoutez la date à votre agenda</div>${calendarButtonsHtml(b.calendarGoogle, b.calendarIcs)}` : ""}
      <p style="font-size:11.5px;color:#8b91ae;line-height:1.5;margin:14px 4px 0;text-align:center">Ton billet est aussi joint en PDF à cet e-mail. Code <b>${esc(b.reference)}</b> à présenter à l'accueil (scan du QR).</p>
    </div>`),
  };
}

/* ---------- Boutons « Ajouter à mon agenda » (Google + .ics Apple/Outlook) ---------- */
export function calendarButtonsHtml(googleUrl: string, icsUrl: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px"><tr>
    <td align="center" style="padding:0 4px">
      <a href="${googleUrl}" style="display:inline-block;background:#fff;border:1.5px solid #dbe2f4;color:#1f6ced;text-decoration:none;font-weight:700;font-size:13px;padding:10px 16px;border-radius:11px">📅 Google Agenda</a>
    </td>
    <td align="center" style="padding:0 4px">
      <a href="${icsUrl}" style="display:inline-block;background:#fff;border:1.5px solid #dbe2f4;color:#1f6ced;text-decoration:none;font-weight:700;font-size:13px;padding:10px 16px;border-radius:11px">🍎 Apple / Outlook</a>
    </td>
  </tr></table>`;
}

type EventEmail = {
  full_name: string;
  reference: string;
  session_title: string;
  session_date: string;              // ex. « samedi 1er août 2026 à 09h »
  mode?: string | null;
  venue?: string | null;
  address?: string | null;
  meeting_url?: string | null;
  meeting_info?: string | null;
  calendarGoogle: string;
  calendarIcs: string;
};

const isOnline = (m?: string | null) => m === "en_ligne";
const isHybrid = (m?: string | null) => m === "hybride";

/* Bloc « comment s'y rendre / se connecter » selon le mode. */
function accessBlock(b: EventEmail): string {
  const rows: string[] = [];
  if (isOnline(b.mode) || isHybrid(b.mode)) {
    if (b.meeting_url) rows.push(`<div style="margin:4px 0"><b style="color:#0a0e27">Lien de connexion :</b> <a href="${b.meeting_url}" style="color:#1f6ced">${esc(b.meeting_url)}</a></div>`);
    if (b.meeting_info) rows.push(`<div style="margin:4px 0;color:#565d80">${esc(b.meeting_info)}</div>`);
  }
  if (!isOnline(b.mode)) {
    const lieu = [b.venue, b.address].filter(Boolean).map(esc).join(" · ");
    if (lieu) rows.push(`<div style="margin:4px 0"><b style="color:#0a0e27">Lieu :</b> ${lieu}</div>`);
  }
  return rows.length ? `<div style="font-size:13px;line-height:1.55;background:#f8faff;border:1px solid #eef2fb;border-radius:12px;padding:12px 14px;margin:12px 0">${rows.join("")}</div>` : "";
}

const REMINDER_HEAD: Record<string, { tag: string; title: string; sub: string }> = {
  reminder_5d: { tag: "Dans 5 jours", title: "Votre formation approche 🗓️", sub: "Bloquez la date : ajoutez l'évènement à votre agenda dès maintenant." },
  reminder_3d: { tag: "Dans 3 jours", title: "Plus que 3 jours 🚀", sub: "On a hâte de vous retrouver. Vérifiez les infos pratiques ci-dessous." },
  reminder_1d: { tag: "C'est demain", title: "Votre formation, c'est demain ✨", sub: "Préparez-vous — voici tout ce qu'il faut savoir." },
  reminder_0d: { tag: "Aujourd'hui", title: "C'est le grand jour ! 🎉", sub: "Votre formation a lieu aujourd'hui. Voici comment nous rejoindre." },
};

/* Rappel d'évènement (J-5 / J-3 / J-1 / J-0). */
export function reminderEmail(kind: string, b: EventEmail) {
  const h = REMINDER_HEAD[kind] || REMINDER_HEAD.reminder_1d;
  const accent = kind === "reminder_0d" ? "#00c89e" : kind === "reminder_1d" ? "#f0a500" : "#1f6ced";
  return {
    subject: `${h.tag} · ${b.session_title}`,
    html: shell(`<div style="padding:22px 22px 6px;text-align:center">
      <div style="display:inline-block;font-family:'Courier New',monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${accent};font-weight:800;border:1px solid ${accent};border-radius:999px;padding:4px 12px">${h.tag}</div>
      <div style="font-size:19px;font-weight:800;color:#0a0e27;margin-top:12px">${h.title}</div>
      <div style="font-size:13.5px;color:#565d80;margin-top:4px">${h.sub}</div>
    </div>
    <div style="padding:8px 20px 22px">
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 6px">Bonjour ${esc(firstName(b.full_name))},</p>
      <div style="font-size:15px;font-weight:800;color:#0a0e27;margin:8px 0 2px">${esc(b.session_title)}</div>
      <div style="font-size:13.5px;color:#1f6ced;font-weight:700">${esc(b.session_date)}</div>
      ${accessBlock(b)}
      ${calendarButtonsHtml(b.calendarGoogle, b.calendarIcs)}
      <p style="font-size:11.5px;color:#8b91ae;line-height:1.5;margin:14px 4px 0;text-align:center">Réf. <b>${esc(b.reference)}</b>${isOnline(b.mode) ? "" : " · présentez ce code (ou votre billet) à l'accueil"}.</p>
    </div>`),
  };
}

/* Demande d'avis (le lendemain de la session). */
export function reviewRequestEmail(b: { full_name: string; session_title: string; review_url: string }) {
  return {
    subject: `Comment s'est passée « ${b.session_title} » ? ⭐`,
    html: shell(`<div style="padding:24px 22px 8px;text-align:center">
      <div style="font-size:30px;letter-spacing:4px;color:#f0a500">★★★★★</div>
      <div style="font-size:19px;font-weight:800;color:#0a0e27;margin-top:8px">Votre avis compte 🙏</div>
    </div>
    <div style="padding:6px 22px 24px">
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 12px">Bonjour ${esc(firstName(b.full_name))}, merci d'avoir participé à <b>« ${esc(b.session_title)} »</b> !</p>
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 14px">Si la formation vous a plu, prenez 30 secondes pour partager votre expérience — ça aide énormément les prochains participants (et ça nous fait très plaisir).</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <a href="${b.review_url}" style="display:inline-block;background:#1f6ced;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:13px 26px;border-radius:12px">Laisser mon avis ⭐</a>
      </td></tr></table>
      <p style="font-size:12px;color:#8b91ae;line-height:1.5;margin:16px 4px 0;text-align:center">Un souci pendant la formation ? Répondez simplement à cet e-mail, on s'en occupe.</p>
    </div>`),
  };
}

/* ---------- Confirmation d'achat d'un PACK de parcours ----------
   « Pass parcours » : liste les places prépayées (1 par formation). Les billets
   nominatifs partent séparément, au fur et à mesure que chaque date est programmée
   (cf. lib/enrollPack + confirmationEmail). */
type PackEmail = {
  reference: string;
  full_name: string;
  pack_title: string;
  amount: number;
  items: { title: string; date?: string | null }[];
};

export function packConfirmationEmail(p: PackEmail) {
  const accent = "#00c89e";
  const rows = (p.items || [])
    .map((it) => {
      const st = it.date
        ? `<span style="font-family:'Courier New',monospace;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${accent};font-weight:700;white-space:nowrap">Place réservée · ${esc(it.date)}</span>`
        : `<span style="font-family:'Courier New',monospace;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#8b94c8;font-weight:700;white-space:nowrap">Réservée · date à venir</span>`;
      return `<tr>
        <td style="padding:9px 0;border-top:1px solid rgba(255,255,255,.12);font-size:12.5px;color:#fff;font-weight:700">${esc(it.title)}</td>
        <td align="right" style="padding:9px 0 9px 10px;border-top:1px solid rgba(255,255,255,.12);vertical-align:middle">${st}</td>
      </tr>`;
    })
    .join("");

  const ticket = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#050a3a" style="border-collapse:separate;border-radius:16px;overflow:hidden;background:#050a3a">
    <tr><td style="padding:18px 16px">
      <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${accent};font-weight:700">— Pass parcours · ${(p.items || []).length} formation${(p.items || []).length > 1 ? "s" : ""}</div>
      <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-.01em;margin:9px 0 6px;line-height:1.25">${esc(p.pack_title)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">
        <tr><td style="border:1px solid ${accent};border-radius:11px;padding:11px 13px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:700">Payé · pack</td>
            <td align="right" style="font-family:'Courier New',monospace;font-size:16px;font-weight:700;color:#ffffff">${fmt(p.amount)}</td>
          </tr></table>
        </td></tr>
      </table>
      <div style="margin:9px 2px 0;font-size:11px;color:#8b94c8;line-height:1.5">Réf. pack <b style="color:#fff">${esc(p.reference)}</b> · rien à régler sur place.</div>
    </td></tr>
  </table>`;

  return {
    subject: `Votre pass parcours est confirmé — ${p.reference}`,
    html: shell(`<div style="padding:24px 22px 6px;text-align:center">
      <div style="width:56px;height:56px;border-radius:50%;background:${accent};color:#fff;font-size:30px;line-height:56px;margin:0 auto 10px">&#10003;</div>
      <div style="font-size:19px;font-weight:800;color:#0a0e27">Pass parcours confirmé&nbsp;!</div>
      <div style="font-size:13px;color:#565d80;margin-top:4px">Votre paiement a bien été vérifié.</div>
    </div>
    <div style="padding:12px 18px 22px">
      <p style="font-size:13.5px;color:#3f4568;line-height:1.6;margin:0 0 14px">Bonjour ${esc(firstName(p.full_name))}, votre pack est réservé. Vous avez <b>${(p.items || []).length} place${(p.items || []).length > 1 ? "s" : ""} prépayée${(p.items || []).length > 1 ? "s" : ""}</b> — une pour chaque formation. Dès qu'une date s'ouvre, on vous inscrit et on vous prévient, sans rien repayer.</p>
      ${ticket}
      <p style="font-size:11.5px;color:#8b91ae;line-height:1.5;margin:14px 4px 0;text-align:center">Vous recevrez un billet nominatif (avec QR) à chaque fois qu'une formation du pack est programmée.</p>
    </div>`),
  };
}

/* ---------- Enrôlement d'une place de PACK (une date vient de s'ouvrir) ----------
   Variante « Bonne nouvelle ! » du billet : ton chaleureux, montant 0 (place déjà
   payée via le pack), billet nominatif + QR + agenda, et rappel du nombre de
   places restantes dans le pack. */
export function packEnrollmentEmail(b: BookingEmail & { remaining?: number }) {
  const accent = "#00c89e";
  const remaining = Math.max(0, Number(b.remaining) || 0);

  const band = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">
      <tr><td style="border:1px solid ${accent};border-radius:11px;padding:11px 13px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:700;white-space:nowrap">Payé · via pack</td>
          <td align="right" style="font-family:'Courier New',monospace;font-size:16px;font-weight:700;color:#ffffff;white-space:nowrap;padding-left:10px">${fmt(0)}</td>
        </tr></table>
      </td></tr>
    </table>`;

  const ticket = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" background="${SITE}/images/billet-bg.png" bgcolor="#050a3a" style="border-collapse:separate;border-radius:16px;overflow:hidden;background:#050a3a url('${SITE}/images/billet-bg.png') center center / cover no-repeat">
    <tr>
      <td style="padding:18px 16px;vertical-align:top">
        <div style="font-family:'Courier New',monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${accent};font-weight:700">— Billet de formation</div>
        <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-.01em;margin:9px 0 2px;line-height:1.25">${esc(b.session_title)}</div>
        <div style="height:6px"></div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${b.session_date ? ticketRow("Date", esc(b.session_date)) : ""}
          ${b.session_venue ? ticketRow("Lieu", esc(b.session_venue)) : ""}
          ${ticketRow("Participant", esc(b.full_name))}
        </table>
        ${band}
        <div style="margin:9px 2px 0;font-size:11px;color:#8b94c8;line-height:1.5">Place réglée via votre pack. Un rappel vous sera envoyé avant la date.</div>
      </td>
      <td width="126" style="width:126px;padding:16px 10px;vertical-align:middle;text-align:center;border-left:2px dashed rgba(255,255,255,.35)">
        <img src="${SITE}/api/billet-qr?ref=${encodeURIComponent(b.reference)}" width="86" height="86" alt="QR ${esc(b.reference)}" style="display:block;margin:0 auto 8px;width:86px;height:86px;background:#fff;border-radius:8px;padding:5px" />
        <div style="font-family:'Courier New',monospace;font-size:8.5px;letter-spacing:.16em;text-transform:uppercase;color:${accent};font-weight:700">Code d'entrée</div>
        <div style="font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:#ffffff;letter-spacing:.03em;margin:5px 0 4px">${esc(b.reference)}</div>
        <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:#8b94c8">Admis · 1</div>
      </td>
    </tr>
  </table>`;

  const leftNote = remaining > 0
    ? `Il vous reste <b>${remaining} place${remaining > 1 ? "s" : ""}</b> dans votre pack. On vous préviendra à chaque nouvelle date.`
    : `C'était la dernière place de votre pack — profitez-en bien&nbsp;!`;

  return {
    subject: `Bonne nouvelle, votre place est réservée — ${b.reference}`,
    html: shell(`<div style="padding:24px 22px 6px;text-align:center">
      <div style="width:56px;height:56px;border-radius:50%;background:#1f6ced;color:#fff;font-size:30px;line-height:56px;margin:0 auto 10px">&#9733;</div>
      <div style="font-size:19px;font-weight:800;color:#0a0e27">Bonne nouvelle, une date s'ouvre&nbsp;!</div>
      <div style="font-size:13px;color:#565d80;margin-top:4px">Votre place du pack est réservée.</div>
    </div>
    <div style="padding:12px 18px 22px">
      <p style="font-size:13.5px;color:#3f4568;line-height:1.6;margin:0 0 14px">Bonjour ${esc(firstName(b.full_name))}, la formation <b>« ${esc(b.session_title)} »</b> de votre pack a désormais une date. Votre place est <b>déjà réservée</b> — rien à faire, rien à payer. Voici votre billet.</p>
      ${ticket}
      ${b.calendarGoogle && b.calendarIcs ? `<div style="text-align:center;font-size:12px;color:#8b91ae;margin-top:16px">Ajoutez la date à votre agenda</div>${calendarButtonsHtml(b.calendarGoogle, b.calendarIcs)}` : ""}
      <p style="font-size:11.5px;color:#8b91ae;line-height:1.5;margin:14px 4px 0;text-align:center">${leftNote}</p>
    </div>`),
  };
}

/* =========================================================
   WEBINAIRE — confirmation d'inscription
   ---------------------------------------------------------
   Tutoiement, contrairement aux e-mails de billetterie : c'est la voix du
   tunnel webinaire (landing, page de remerciement, publicité). Un inscrit qui
   se fait vouvoyer par e-mail après avoir été tutoyé partout ailleurs a
   l'impression de recevoir le message d'un autre expéditeur.

   Le lien de connexion n'est pas toujours connu au moment de l'inscription :
   quand il manque, on le dit franchement plutôt que d'afficher un bloc vide —
   l'inscrit sait alors qu'il n'a rien raté.
   ========================================================= */
export type WebinaireEmail = {
  prenom: string;
  title: string;
  /** « dimanche 6 septembre 2026 à 20 h » — déjà formaté à l'heure d'Abidjan. */
  date_label: string;
  duration_min: number;
  join_url?: string | null;
  join_info?: string | null;
  calendarGoogle: string;
  calendarIcs: string;
};

export function webinaireConfirmationEmail(w: WebinaireEmail) {
  const acces = w.join_url
    ? `<div style="margin:4px 0"><b style="color:#0a0e27">Ton lien de connexion :</b><br><a href="${w.join_url}" style="color:#1f6ced;word-break:break-all">${esc(w.join_url)}</a></div>`
    : `<div style="margin:4px 0;color:#565d80">Ton lien de connexion t'arrive par e-mail le jour du live — garde un œil sur ta boîte.</div>`;
  const consigne = w.join_info
    ? `<div style="margin:6px 0 0;color:#565d80">${esc(w.join_info)}</div>`
    : "";

  return {
    subject: `C'est réservé — ${w.date_label}`,
    html: shell(`<div style="padding:24px 22px 6px;text-align:center">
      <div style="width:56px;height:56px;border-radius:50%;background:#00c89e;color:#fff;font-size:30px;line-height:56px;margin:0 auto 10px">&#10003;</div>
      <div style="font-size:19px;font-weight:800;color:#0a0e27">Ta place est réservée</div>
      <div style="font-size:13.5px;color:#565d80;margin-top:4px">Rendez-vous ${esc(w.date_label)}.</div>
    </div>
    <div style="padding:10px 20px 24px">
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 12px">Bonjour ${esc(firstName(w.prenom))},</p>
      <p style="font-size:14px;color:#3f4568;line-height:1.6;margin:0 0 12px">
        Tu es bien inscrit au live <b>« ${esc(w.title)} »</b>. ${w.duration_min} minutes en direct, et tu repars avec la méthode
        pour transformer une compétence que tu as déjà en produit digital qui encaisse.</p>
      <div style="font-size:13px;line-height:1.55;background:#f8faff;border:1px solid #eef2fb;border-radius:12px;padding:12px 14px;margin:12px 0">
        <div style="margin:4px 0"><b style="color:#0a0e27">Quand :</b> ${esc(w.date_label)} (heure d'Abidjan)</div>
        ${acces}
        ${consigne}
      </div>
      <div style="text-align:center;font-size:12px;color:#8b91ae;margin-top:16px">La seule chose à faire d'ici là : bloque le créneau.</div>
      ${calendarButtonsHtml(w.calendarGoogle, w.calendarIcs)}
      <p style="font-size:14px;color:#3f4568;margin:18px 0 0">À dimanche,<br>Godwin</p>
    </div>`),
    text: [
      `Bonjour ${firstName(w.prenom)},`,
      "",
      `Ta place est réservée pour le live « ${w.title} ».`,
      `Quand : ${w.date_label} (heure d'Abidjan), ${w.duration_min} minutes en direct.`,
      w.join_url
        ? `Ton lien de connexion : ${w.join_url}`
        : "Ton lien de connexion t'arrive par e-mail le jour du live.",
      w.join_info || "",
      "",
      `Ajoute la date à ton agenda : ${w.calendarGoogle}`,
      "",
      "À dimanche,",
      "Godwin — Bweb Agence",
    ].filter(Boolean).join("\n"),
  };
}
