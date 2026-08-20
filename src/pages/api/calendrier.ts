export const prerender = false;

import type { APIRoute } from "astro";
import { supabase } from "../../lib/supabase";
import { eventFromSession, icsFromEvent } from "../../lib/calendar";
import { evenementWebinaire } from "../../lib/webinaireEmails";

const fichierIcs = (ics: string, nom: string) =>
  new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });

/**
 * Sert un fichier .ics (Apple Calendar / Outlook / autres) pour une session
 * (?s=<session_id>) ou pour un webinaire (?w=<slug>).
 * Appelé par les boutons « Ajouter à mon agenda » des e-mails et de la page de
 * retour de paiement.
 */
export const GET: APIRoute = async ({ request }) => {
  const params = new URL(request.url).searchParams;

  /* Webinaire : la fiche complète n'est PAS publique (elle porte le lien du
     live). La fonction `webinaire_public` ne rend que le titre et l'horaire —
     de quoi poser la date dans un agenda, rien de plus. Le lien de connexion
     n'arrive que par e-mail, aux inscrits. */
  const slug = params.get("w") || "";
  if (slug) {
    const { data } = await supabase.rpc("webinaire_public", { p_slug: slug });
    const w = Array.isArray(data) ? data[0] : data;
    if (!w) return new Response("webinaire introuvable", { status: 404 });
    const ics = icsFromEvent(
      evenementWebinaire({
        id: "", slug, title: w.title, starts_at: w.starts_at,
        duration_min: w.duration_min, join_url: null, join_info: null, replay_url: null,
      }),
      `webinaire-${slug}`,
    );
    return fichierIcs(ics, `live-bweb-${slug.slice(0, 40)}.ics`);
  }

  const id = params.get("s") || "";
  if (!id) return new Response("missing session", { status: 400 });

  // Client public (anon) : la RLS n'expose que les sessions published/full.
  const { data: s } = await supabase
    .from("sessions")
    .select("title,slug,starts_at,ends_at,mode,venue,address,city,meeting_url,meeting_info")
    .eq("id", id)
    .maybeSingle();

  if (!s) return new Response("session introuvable", { status: 404 });

  const ics = icsFromEvent(eventFromSession(s as any), id);
  return fichierIcs(ics, `bweb-${(s.slug || "formation").slice(0, 40)}.ics`);
};
