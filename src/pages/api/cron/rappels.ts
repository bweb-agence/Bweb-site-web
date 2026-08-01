export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { sendDueRappels } from "../../../lib/sendRappels";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/**
 * Rappels d'évènement (J-5/J-3/J-1/J-0) + demande d'avis (J+1).
 * Exécuté chaque matin via le cron Vercel /api/cron/campagnes (06h), qui appelle
 * la même logique partagée. Cet endpoint permet un déclenchement MANUEL (test) ou
 * un cron externe Hostinger : GET/POST avec Authorization: Bearer CRON_SECRET ou
 * ?key=CRON_SECRET.
 */
async function handle(request: Request): Promise<Response> {
  const secret = import.meta.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") || "";
    const key = new URL(request.url).searchParams.get("key") || "";
    if (auth !== `Bearer ${secret}` && key !== secret) return json({ ok: false, error: "unauthorized" }, 401);
  }
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const res = await sendDueRappels(createAdminClient());
  return json({ ok: true, ...res });
}

export const GET: APIRoute = ({ request }) => handle(request);
export const POST: APIRoute = ({ request }) => handle(request);
