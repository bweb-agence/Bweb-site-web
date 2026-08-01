export const prerender = false;

import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
import { eventFromSession, icsFromEvent } from "../../lib/calendar";

/**
 * Sert un fichier .ics (Apple Calendar / Outlook / autres) pour une session.
 * Appelé par les boutons « Ajouter à mon agenda » des e-mails et de la page de
 * retour de paiement. Paramètre : ?s=<session_id>.
 */
export const GET: APIRoute = async ({ request }) => {
  const id = new URL(request.url).searchParams.get("s") || "";
  if (!id) return new Response("missing session", { status: 400 });

  // Client public (anon) : la RLS n'expose que les sessions published/full.
  const { data: s } = await supabase
    .from("sessions")
    .select("title,slug,starts_at,ends_at,mode,venue,address,city,meeting_url,meeting_info")
    .eq("id", id)
    .maybeSingle();

  if (!s) return new Response("session introuvable", { status: 404 });

  const ics = icsFromEvent(eventFromSession(s as any), id);
  const fileName = `bweb-${(s.slug || "formation").slice(0, 40)}.ics`;
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
};
