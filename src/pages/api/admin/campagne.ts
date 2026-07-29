export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { sendEmail, campaignEmailHtml } from "../../../lib/email";

const SITE = "https://www.bwebagence.com";
const MAX_RECIPIENTS = 1000;

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

type Recipient = { email: string; prenom?: string };
type Body = {
  subject?: string;
  message?: string;
  audience?: string;
  session_id?: string | null;
  session?: { title?: string; date?: string; lien?: string } | null;
  recipients?: Recipient[];
  test?: boolean;
};

// Remplace les variables {prenom} {formation} {date} {lien} dans un texte.
function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(prenom|formation|date|lien)\}/g, (_, k) => vars[k] ?? "");
}

/* Envoi d'une campagne e-mail à la base clients (réservé aux admins).
   - Exclut les désabonnés (email_opt_in = false) côté serveur.
   - Ajoute un lien de désabonnement par destinataire (jeton).
   - Enregistre la campagne dans `campaigns`. */
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createAdminClient();
  const { data: userData } = await admin.auth.getUser(token);
  const adminEmail = userData?.user?.email;
  if (!adminEmail) return json({ ok: false, error: "unauthorized" }, 401);
  const { data: adminRow } = await admin.from("admins").select("email").ilike("email", adminEmail).maybeSingle();
  if (!adminRow) return json({ ok: false, error: "forbidden" }, 403);

  let body: Body;
  try { body = await request.json(); } catch { return json({ ok: false, error: "invalid" }, 400); }

  const subject = (body.subject || "").trim();
  const message = (body.message || "").trim();
  if (!subject || !message) return json({ ok: false, error: "missing_fields" }, 400);

  const sess = body.session || {};
  const sessVars = { formation: sess.title || "", date: sess.date || "", lien: sess.lien || "" };

  // L'envoi passe par Bird ; si Bird n'est pas configuré, sendEmail renvoie false.
  // Mode test : un seul e-mail vers l'admin connecté.
  if (body.test) {
    const html = campaignEmailHtml(fill(message, { prenom: (adminEmail.split("@")[0] || "toi"), ...sessVars }), `${SITE}/desabonnement`);
    const ok = await sendEmail({ to: adminEmail, subject: fill(subject, { prenom: "", ...sessVars }), html });
    return json({ ok, test: true, sent: ok ? 1 : 0, total: 1, configured: ok });
  }

  // Destinataires (fournis par l'admin) : normalisation + déduplication.
  const wanted = new Map<string, Recipient>();
  for (const r of body.recipients || []) {
    const e = (r.email || "").trim().toLowerCase();
    if (e && !wanted.has(e)) wanted.set(e, { email: e, prenom: r.prenom });
  }
  if (wanted.size === 0) return json({ ok: false, error: "no_recipients" }, 400);
  if (wanted.size > MAX_RECIPIENTS) return json({ ok: false, error: "too_many" }, 400);

  // Récupère jetons + statut de consentement (autorité serveur sur l'opt-out).
  const { data: custs } = await admin
    .from("customers")
    .select("email,email_opt_in,unsubscribe_token,full_name")
    .in("email", [...wanted.keys()]);
  const byEmail = new Map((custs || []).map((c: any) => [String(c.email).toLowerCase(), c]));

  let sent = 0;
  let excluded = 0;
  for (const [email, r] of wanted) {
    const cu = byEmail.get(email);
    if (cu && cu.email_opt_in === false) { excluded++; continue; } // désabonné → jamais
    const prenom = (r.prenom || (cu?.full_name ? String(cu.full_name).trim().split(/\s+/)[0] : "") || "").trim();
    const unsub = cu?.unsubscribe_token ? `${SITE}/desabonnement?t=${cu.unsubscribe_token}` : `${SITE}/desabonnement`;
    const html = campaignEmailHtml(fill(message, { prenom, ...sessVars }), unsub);
    const ok = await sendEmail({ to: email, subject: fill(subject, { prenom, ...sessVars }), html });
    if (ok) sent++;
  }

  await admin.from("campaigns").insert({
    channel: "email",
    audience: body.audience || "—",
    session_id: body.session_id || null,
    subject,
    message,
    recipients_count: wanted.size - excluded,
    sent_count: sent,
    created_by: adminEmail,
  });

  return json({ ok: true, sent, excluded, total: wanted.size, configured: sent > 0 || wanted.size === excluded });
};
