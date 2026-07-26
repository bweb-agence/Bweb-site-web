// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel/serverless";

// URL de production — à ajuster au domaine final.
// Sert au sitemap, aux URLs canoniques et aux métadonnées Open Graph.
const SITE = "https://www.bwebagence.com";

export default defineConfig({
  site: SITE,
  trailingSlash: "ignore",
  integrations: [sitemap()],
  // Rendu HYBRIDE : les pages restent statiques par défaut (aucune régression
  // sur les pages vitrine). Les nouvelles pages dynamiques (calendrier,
  // réservation, admin, API) désactivent le prérendu via `export const prerender = false`.
  output: "hybrid",
  adapter: vercel(),
  build: {
    // Génère /services/index.html -> URL propre /services
    format: "directory",
  },
});
