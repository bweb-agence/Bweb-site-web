export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { envoyerSequenceWebinaire } from "../../../lib/webinaireEmails";
import { secret } from "../../../lib/env";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/**
 * Séquence e-mail du tunnel webinaire (J-1, jour J, une heure avant,
 * ouverture des portes, replay).
 *
 * Le cron Vercel de 06 h appelle déjà la même logique via /api/cron/campagnes :
 * il couvre les rappels du matin. Les deux messages du soir demandent une heure
 * PRÉCISE, que le plan Hobby (un passage quotidien) ne sait pas donner — d'où
 * ce point d'entrée, appelé par le cron du VPS :
 *
 *   50 17,18 6 9 *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *                     https://www.bwebagence.com/api/cron/webinaire
 *
 * Rappeler plusieurs fois dans la même fenêtre est sans danger : le journal
 * d'envois refuse les doublons, et un passage tronqué par le budget de temps
 * reprend là où il s'est arrêté (`reste` dans la réponse).
 */
async function handle(request: Request): Promise<Response> {
  // Fail-closed : sans secret configuré, l'endpoint est fermé (jamais public).
  const cronSecret = secret("CRON_SECRET");
  if (!cronSecret) return json({ ok: false, error: "not_configured" }, 503);
  const auth = request.headers.get("authorization") || "";
  const key = new URL(request.url).searchParams.get("key") || "";
  if (auth !== `Bearer ${cronSecret}` && key !== cronSecret) return json({ ok: false, error: "unauthorized" }, 401);

  const rapport = await envoyerSequenceWebinaire(createAdminClient());
  return json({ ok: true, ...rapport });
}

export const GET: APIRoute = ({ request }) => handle(request);
export const POST: APIRoute = ({ request }) => handle(request);
