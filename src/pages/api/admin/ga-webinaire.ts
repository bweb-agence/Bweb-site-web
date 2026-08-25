export const prerender = false;

/* =========================================================
   Visites du tunnel webinaire, lues dans Google Analytics
   -----------------------------------------------------------
   L'écran d'analyse tient tout le reste de notre base ; seules les VISITES
   viennent de GA4, qui exige une clé de service. Elle ne peut pas descendre
   dans le navigateur : cette route la garde côté serveur et ne rend que deux
   nombres.

   Réservée au personnel — même contrôle que /api/admin/confirmer : jeton de
   session en en-tête, identité vérifiée, appartenance à la table `admins`.
   ========================================================= */
import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { ga4Configure, sessionsParChemin } from "../../../lib/ga4";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ request, url }) => {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createAdminClient();
  const { data: userData } = await admin.auth.getUser(token);
  const email = userData?.user?.email;
  if (!email) return json({ ok: false, error: "unauthorized" }, 401);
  const { data: adminRow } = await admin.from("admins").select("email").ilike("email", email).maybeSingle();
  if (!adminRow) return json({ ok: false, error: "forbidden" }, 403);

  /* `not_configured` plutôt qu'une erreur : l'écran sait afficher « en attente
     de connexion » et le reste de l'analyse continue de s'afficher. */
  if (!ga4Configure()) return json({ ok: true, configure: false });

  const tunnel = (url.searchParams.get("tunnel") || "").replace(/[^a-z0-9-]/gi, "");
  const depuis = (url.searchParams.get("depuis") || "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  if (!tunnel || !depuis) return json({ ok: false, error: "invalid" }, 400);

  const landing = `/${tunnel}`;
  const merci = `/${tunnel}/merci`;
  const sessions = await sessionsParChemin([landing, merci], depuis);
  if (!sessions) return json({ ok: true, configure: true, joignable: false });

  return json({
    ok: true, configure: true, joignable: true,
    visites: sessions[landing] ?? 0,
    merci: sessions[merci] ?? 0,
    depuis,
  });
};
