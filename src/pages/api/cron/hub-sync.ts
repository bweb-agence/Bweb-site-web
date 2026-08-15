export const prerender = false;

/* =========================================================
   BWEB AGENCE — Synchro quotidienne des contacts vers ACQ Hub
   -----------------------------------------------------------
   Transmet à l'Edge Function `ingest` les contacts nouveaux ou modifiés depuis
   leur dernière transmission (cf. src/lib/syncHub.ts). Objectif : garder les
   deux bases au même niveau, sans que le site dépende d'ACQ Hub au moment où
   quelqu'un remplit un formulaire.

   Deux déclencheurs possibles, au choix :
   - chaîné dans /api/cron/campagnes (06 h) — c'est le cas par défaut, sans rien
     configurer, parce que le plan Vercel Hobby n'autorise que 2 crons et qu'ils
     sont déjà pris (03 h réconciliation, 06 h campagnes) ;
   - cet endpoint, appelé par un cron externe (VPS OVH) pour une heure précise :
       0 0 * * *  curl -fsS "https://bwebagence.com/api/cron/hub-sync?key=$CRON_SECRET"

   Rejouable sans risque : l'idempotence est portée par la clé `site:contact:<id>`
   et seuls les contacts modifiés depuis leur dernière transmission repartent.
   ========================================================= */
import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { syncContactsToHub } from "../../../lib/syncHub";
import { secret } from "../../../lib/env";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

async function handle(request: Request): Promise<Response> {
  // Fail-closed : sans secret configuré, l'endpoint est fermé (jamais public).
  const cronSecret = secret("CRON_SECRET");
  if (!cronSecret) return json({ ok: false, error: "not_configured" }, 503);

  const auth = request.headers.get("authorization") || "";
  const key = new URL(request.url).searchParams.get("key") || "";
  if (auth !== `Bearer ${cronSecret}` && key !== cronSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const report = await syncContactsToHub(createAdminClient());
    return json({ ok: true, ...report });
  } catch (err) {
    console.error("[hub-sync] passe interrompue —", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "sync_failed" }, 500);
  }
}

export const GET: APIRoute = ({ request }) => handle(request);
export const POST: APIRoute = ({ request }) => handle(request);
