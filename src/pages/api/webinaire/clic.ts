export const prerender = false;

/* =========================================================
   BWEB ACADEMY — Clic vers le groupe d'un webinaire sans formulaire
   -----------------------------------------------------------
   Sur /webinaire-facebook-ads, rejoindre le groupe WhatsApp EST l'inscription.
   Cette route garde la trace du clic pour que /admin/webinaires puisse dire
   combien de visiteurs sont partis vers le groupe.

   Un clic par visiteur et par édition : l'identifiant vient du navigateur,
   l'unicité (webinaire_id, visiteur) en base fait le reste. Ce n'est pas une
   liste de personnes — ni nom, ni numéro — et on ne sait pas si le visiteur a
   vraiment rejoint une fois dans WhatsApp.

   Réponse toujours légère : le navigateur l'envoie en `keepalive` au moment
   de partir vers WhatsApp, et n'attend rien d'elle.
   ========================================================= */
import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { getWebinaire } from "../../../lib/webinaireEmails";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/* ---------- Limite de débit best-effort (par instance serverless) ----------
   Même approche que api/lead.ts : coupe les rafales, sans prétendre être un
   rate-limit distribué. */
const WINDOW_MS = 60_000;
const MAX_HITS = 10;
const HITS = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 500) HITS.delete(HITS.keys().next().value as string); // borne mémoire
  return arr.length > MAX_HITS;
}

const court = (v: unknown, max = 80): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || clientAddress || "unknown";
  if (rateLimited(ip)) return json({ ok: false, error: "rate_limited" }, 429);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }

  const tunnel = typeof body.tunnel === "string" ? body.tunnel : "";
  const visiteur = typeof body.visiteur === "string" ? body.visiteur.toLowerCase() : "";
  if (!/^[a-z0-9-]{2,60}$/.test(tunnel) || !/^[a-z0-9-]{8,64}$/.test(visiteur)) {
    return json({ ok: false, error: "invalid" }, 400);
  }

  const admin = createAdminClient();
  const webinaire = await getWebinaire(admin, tunnel);
  /* Seule une édition en inscription par le groupe compte ses clics : pour un
     entonnoir à formulaire, l'inscription se mesure par le formulaire. */
  if (!webinaire || !webinaire.inscription_groupe) return json({ ok: false, error: "not_found" }, 404);

  const { error } = await admin.from("webinaire_clics").upsert(
    {
      webinaire_id: webinaire.id,
      visiteur,
      source: court(body.source),
      campagne: court(body.campagne, 120),
    },
    { onConflict: "webinaire_id,visiteur", ignoreDuplicates: true },
  );
  if (error) {
    console.error("[webinaire] clic non enregistré —", error.message);
    return json({ ok: false, error: "db" }, 500);
  }
  return json({ ok: true });
};
