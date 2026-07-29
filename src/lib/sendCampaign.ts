/* =========================================================
   BWEB — Envoi d'une campagne e-mail (mutualisé : envoi immédiat + cron).
   - Déduplique les destinataires.
   - Exclut les désabonnés (email_opt_in = false) — autorité serveur.
   - Personnalise {prenom} {formation} {date} {lien} par destinataire.
   - Ajoute un lien de désabonnement (jeton) à chaque e-mail.
   ========================================================= */
import { sendEmail, campaignEmailHtml, campaignEmailFromHtml } from "./email";

const SITE = "https://www.bwebagence.com";
export const MAX_RECIPIENTS = 1000;

export type Recipient = { email: string; prenom?: string };
export type CampaignContent = {
  subject: string;
  message?: string;   // corps texte (converti en HTML) — si pas de modèle
  bodyHtml?: string;  // corps HTML riche (modèle) — prioritaire
  session?: { title?: string; date?: string; lien?: string } | null;
};

export function fillVars(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(prenom|formation|date|lien)\}/g, (_, k) => vars[k] ?? "");
}

/** Envoie l'e-mail de campagne à la liste fournie. Renvoie le décompte. */
export async function sendCampaignEmails(
  admin: any,
  content: CampaignContent,
  recipients: Recipient[],
): Promise<{ sent: number; excluded: number; total: number }> {
  // Déduplication par e-mail (minuscules)
  const wanted = new Map<string, Recipient>();
  for (const r of recipients) {
    const e = (r.email || "").trim().toLowerCase();
    if (e && !wanted.has(e)) wanted.set(e, { email: e, prenom: r.prenom });
  }
  if (wanted.size === 0) return { sent: 0, excluded: 0, total: 0 };

  // Jetons + consentement (autorité serveur sur l'opt-out)
  const { data: custs } = await admin
    .from("customers")
    .select("email,email_opt_in,unsubscribe_token,full_name")
    .in("email", [...wanted.keys()]);
  const byEmail = new Map((custs || []).map((c: any) => [String(c.email).toLowerCase(), c]));

  const sess = content.session || {};
  const sessVars = { formation: sess.title || "", date: sess.date || "", lien: sess.lien || "" };

  let sent = 0, excluded = 0;
  for (const [email, r] of wanted) {
    const cu = byEmail.get(email) as any;
    if (cu && cu.email_opt_in === false) { excluded++; continue; }
    const prenom = (r.prenom || (cu?.full_name ? String(cu.full_name).trim().split(/\s+/)[0] : "") || "").trim();
    const vars = { prenom, ...sessVars };
    const unsub = cu?.unsubscribe_token ? `${SITE}/desabonnement?t=${cu.unsubscribe_token}` : `${SITE}/desabonnement`;
    const html = content.bodyHtml
      ? campaignEmailFromHtml(fillVars(content.bodyHtml, vars), unsub)
      : campaignEmailHtml(fillVars(content.message || "", vars), unsub);
    const ok = await sendEmail({ to: email, subject: fillVars(content.subject, vars), html });
    if (ok) sent++;
  }
  return { sent, excluded, total: wanted.size };
}
