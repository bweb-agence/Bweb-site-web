export const prerender = false;

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { enrollForSession } from "../../../lib/enrollPack";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/**
 * Enrôlement INSTANTANÉ des détenteurs de pack pour une session qui vient d'être
 * publiée. Appelé par l'admin depuis la pastille « mettre en ligne ». Réservé à
 * l'admin : on vérifie le JWT de l'appelant via la fonction SQL is_admin().
 * (Le cron campagnes fait de toute façon un balayage quotidien en filet.)
 */
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !url || !anon) return json({ ok: false, error: "unauthorized" }, 401);

  // L'appelant est-il admin ? (is_admin() lit l'e-mail de son JWT.)
  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isAdmin } = await asUser.rpc("is_admin");
  if (isAdmin !== true) return json({ ok: false, error: "forbidden" }, 403);

  let sessionId = "";
  try {
    const b = await request.json();
    sessionId = String(b?.session_id || "").trim();
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (!sessionId) return json({ ok: false, error: "invalid" }, 400);

  const enrolled = await enrollForSession(createAdminClient(), sessionId);
  return json({ ok: true, enrolled });
};
