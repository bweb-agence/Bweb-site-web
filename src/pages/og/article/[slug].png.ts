/* Image Open Graph dynamique d'un article de blog (1200×630 PNG). */
export const prerender = false;

import type { APIRoute } from "astro";
import { supabase } from "../../../lib/supabase";
import { renderOg } from "../../../lib/og";
import { frDateLong } from "../../../lib/format";

export const GET: APIRoute = async ({ params, request }) => {
  const { data: p } = await supabase
    .from("posts")
    .select("title,category,author,published_at")
    .eq("slug", params.slug)
    .eq("status", "published")
    .maybeSingle();

  const title = (p as any)?.title || "Blog Bweb Agence";
  const meta = [(p as any)?.author || "Équipe Bweb", p?.published_at ? frDateLong(p.published_at) : null]
    .filter(Boolean)
    .join("   ·   ");

  return renderOg({
    origin: new URL(request.url).origin,
    kicker: (p as any)?.category || "Blog",
    title,
    meta,
  });
};
