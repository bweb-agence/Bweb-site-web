/* Image Open Graph dynamique d'une session de formation (1200×630 PNG). */
export const prerender = false;

import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
import { renderOg } from "../../../lib/og";
import { frDateLong, modeLabel } from "../../../lib/format";

export const GET: APIRoute = async ({ params, request }) => {
  const { data: s } = await supabase
    .from("sessions")
    .select("title,theme,starts_at,venue,mode")
    .eq("slug", params.slug)
    .in("status", ["published", "full"])
    .maybeSingle();

  const title = (s as any)?.title || "Formation Bweb Agence";
  const meta = [s?.starts_at ? frDateLong(s.starts_at) : null, modeLabel((s as any)?.mode)]
    .filter(Boolean)
    .join("   ·   ");

  return renderOg({
    origin: new URL(request.url).origin,
    kicker: (s as any)?.theme || "Formation",
    title,
    meta,
  });
};
