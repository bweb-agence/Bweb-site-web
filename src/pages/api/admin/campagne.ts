export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { sendEmail, campaignEmailHtml, campaignEmailFromHtml } from "../../../lib/email";
import { sendCampaignEmails, fillVars, MAX_RECIPIENTS } from "../../../lib/sendCampaign";

const SITE = "https://www.bwebagence.com";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

type Recipient = { email: string; prenom?: string };
type Body = {
  subject?: string;
  message?: string;
  body_html?: string;
  template_id?: string | null;
  audience?: string;
  session_id?: string | null;
  session?: { title?: string; date?: string; lien?: string } | null;
  recipients?: Recipient[];
  test?: boolean;
};

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
  const bodyHtml = (body.body_html || "").trim();
  if (!subject || (!message && !bodyHtml)) return json({ ok: false, error: "missing_fields" }, 400);

  const sess = body.session || {};
  const sessVars = { formation: sess.title || "", date: sess.date || "", lien: sess.lien || "" };

  // L'envoi passe par Bird ; si Bird n'est pas configuré, sendEmail renvoie false.
  // Mode test : un seul e-mail vers l'admin connecté.
  if (body.test) {
    const vars = { prenom: (adminEmail.split("@")[0] || "toi"), ...sessVars };
    const html = bodyHtml
      ? campaignEmailFromHtml(fillVars(bodyHtml, vars), `${SITE}/desabonnement`)
      : campaignEmailHtml(fillVars(message, vars), `${SITE}/desabonnement`);
    const ok = await sendEmail({ to: adminEmail, subject: fillVars(subject, vars), html });
    return json({ ok, test: true, sent: ok ? 1 : 0, total: 1, configured: ok });
  }

  const list = (body.recipients || []).filter((r) => r.email);
  if (list.length === 0) return json({ ok: false, error: "no_recipients" }, 400);
  if (list.length > MAX_RECIPIENTS) return json({ ok: false, error: "too_many" }, 400);

  const { sent, excluded, total } = await sendCampaignEmails(
    admin,
    { subject, message, bodyHtml: bodyHtml || undefined, session: body.session },
    list,
  );

  await admin.from("campaigns").insert({
    channel: "email",
    audience: body.audience || "—",
    session_id: body.session_id || null,
    template_id: body.template_id || null,
    subject,
    message: bodyHtml ? "(modèle e-mail)" : message,
    body_html: bodyHtml || null,
    status: "sent",
    sent_at: new Date().toISOString(),
    recipients_count: total - excluded,
    sent_count: sent,
    created_by: adminEmail,
  });

  return json({ ok: true, sent, excluded, total, configured: sent > 0 || total === excluded });
};
