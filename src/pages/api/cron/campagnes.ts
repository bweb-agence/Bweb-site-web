export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { sendCampaignEmails, type Recipient } from "../../../lib/sendCampaign";
import { sendDueRappels } from "../../../lib/sendRappels";
import { enrollDuePackHolders } from "../../../lib/enrollPack";
import { syncContactsToHub } from "../../../lib/syncHub";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/**
 * Cron d'envoi des campagnes e-mail programmées.
 * Traite les campagnes `status = 'scheduled'` dont `scheduled_at <= now()`.
 * Les variables de session ({formation}/{date}/{lien}) sont déjà figées à la
 * programmation ; il ne reste que {prenom}, rempli par destinataire ici.
 * L'opt-out est re-vérifié au moment de l'envoi (autorité serveur).
 *
 * Déclencheurs : cron Vercel (Bearer CRON_SECRET) OU cron externe Hostinger
 * (?key=CRON_SECRET) — idéalement toutes les ~15 min pour une heure précise.
 */
async function handle(request: Request): Promise<Response> {
  // Fail-closed : sans secret configuré, l'endpoint est fermé (jamais public).
  const secret = import.meta.env.CRON_SECRET;
  if (!secret) return json({ ok: false, error: "not_configured" }, 503);
  const auth = request.headers.get("authorization") || "";
  const key = new URL(request.url).searchParams.get("key") || "";
  if (auth !== `Bearer ${secret}` && key !== secret) return json({ ok: false, error: "unauthorized" }, 401);
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Rappels d'évènement (J-5/J-3/J-1/J-0) + demande d'avis (J+1) — chaînés ici
  // pour ne pas ajouter un 3ᵉ cron Vercel (plan Hobby limité à 2).
  let rappels = { candidates: 0, sent: 0 };
  try { rappels = await sendDueRappels(admin); } catch { /* non bloquant pour les campagnes */ }

  // Enrôlement auto des détenteurs de pack (filet de sécurité : rattrape les
  // sessions publiées dont l'enrôlement instantané a été manqué). Non bloquant.
  let packEnrol = { sessions: 0, enrolled: 0 };
  try { packEnrol = await enrollDuePackHolders(admin); } catch { /* non bloquant */ }

  // Mise à niveau quotidienne des bases avec ACQ Hub. Chaînée ici pour la même
  // raison que les rappels : le plan Hobby n'autorise que 2 crons Vercel, déjà
  // pris (03 h réconciliation, 06 h ce cron). Pour une heure précise — minuit —
  // un cron externe appelle /api/cron/hub-sync, qui fait exactement la même chose.
  let hub: Awaited<ReturnType<typeof syncContactsToHub>> = { traites: 0, transmis: 0, echecs: 0, reste: 0 };
  try { hub = await syncContactsToHub(admin); } catch { /* non bloquant */ }

  const { data: due } = await admin
    .from("campaigns")
    .select("id, subject, message, body_html, recipients")
    .eq("channel", "email")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .limit(20);

  if (!due || due.length === 0) return json({ ok: true, processed: 0, rappels, packEnrol, hub });

  const results: any[] = [];
  for (const c of due as any[]) {
    // Verrou optimiste : ne traiter que si toujours 'scheduled'
    const { data: locked } = await admin
      .from("campaigns").update({ status: "sending" })
      .eq("id", c.id).eq("status", "scheduled").select("id").maybeSingle();
    if (!locked) continue;

    try {
      const recipients = (Array.isArray(c.recipients) ? c.recipients : []) as Recipient[];
      const { sent, excluded, total } = await sendCampaignEmails(
        admin,
        { subject: c.subject || "", bodyHtml: c.body_html || undefined, message: c.body_html ? undefined : (c.message || ""), session: null },
        recipients,
      );
      await admin.from("campaigns").update({
        status: "sent", sent_at: new Date().toISOString(),
        sent_count: sent, recipients_count: total - excluded, error: null,
      }).eq("id", c.id);
      results.push({ id: c.id, sent, total });
    } catch (e: any) {
      await admin.from("campaigns").update({ status: "failed", error: String(e?.message || e).slice(0, 500) }).eq("id", c.id);
      results.push({ id: c.id, error: true });
    }
  }
  return json({ ok: true, processed: results.length, results, rappels, packEnrol, hub });
}

export const GET: APIRoute = ({ request }) => handle(request);
export const POST: APIRoute = ({ request }) => handle(request);
