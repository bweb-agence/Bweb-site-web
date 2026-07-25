// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// URL de production — à ajuster au domaine final.
// Sert au sitemap, aux URLs canoniques et aux métadonnées Open Graph.
const SITE = "https://www.bwebagence.com";

export default defineConfig({
  site: SITE,
  trailingSlash: "ignore",
  integrations: [sitemap()],
  build: {
    // Génère /services/index.html -> URL propre /services
    format: "directory",
  },
  // Minification CSS/JS par défaut (esbuild) — suffisant et sans dépendance.
});
