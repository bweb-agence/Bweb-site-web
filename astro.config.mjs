// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";

// URL de production — à ajuster au domaine final.
// Sert au sitemap, aux URLs canoniques et aux métadonnées Open Graph.
const SITE = "https://www.bwebagence.com";

export default defineConfig({
  site: SITE,
  trailingSlash: "ignore",
  integrations: [sitemap()],
  // Rendu STATIQUE par défaut (aucune régression sur les pages vitrine).
  // Depuis Astro 5, `static` intègre l'ancien mode `hybrid` : les pages
  // dynamiques (calendrier, réservation, admin, API) restent rendues à la
  // demande via `export const prerender = false`.
  output: "static",
  adapter: vercel(),
  build: {
    // Génère /services/index.html -> URL propre /services
    format: "directory",
  },
});
