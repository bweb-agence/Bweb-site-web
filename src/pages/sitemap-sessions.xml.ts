/* =========================================================
   Sitemap dynamique : pages SSR non couvertes par @astrojs/sitemap
   (sessions de formation publiées à venir + articles de blog publiés).
   Servi à /sitemap-sessions.xml, régénéré à chaque requête.
   ========================================================= */
export const prerender = false;

import type { APIRoute } from "astro";
import { supabase } from "../lib/supabase";
import { site } from "../config/site";

const SITE = site.url.replace(/\/$/, "");
const xmlEscape = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] || c);

export const GET: APIRoute = async () => {
  const nowIso = new Date().toISOString();

  const [{ data: sessions }, { data: posts }] = await Promise.all([
    supabase
      .from("sessions")
      .select("slug,updated_at,starts_at")
      .in("status", ["published", "full"])
      .gte("starts_at", nowIso) // les sessions passées sont en noindex → on les exclut
      .order("starts_at", { ascending: true }),
    supabase
      .from("posts")
      .select("slug,updated_at,published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false }),
  ]);

  const entries: { loc: string; lastmod?: string | null }[] = [
    ...(sessions ?? []).map((s: any) => ({ loc: `${SITE}/formations/session/${s.slug}`, lastmod: s.updated_at })),
    ...(posts ?? []).map((p: any) => ({ loc: `${SITE}/blog/${p.slug}`, lastmod: p.updated_at || p.published_at })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map((e) => {
        const lm = e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : "";
        return `  <url><loc>${xmlEscape(e.loc)}</loc>${lm}</url>`;
      })
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
};
