// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

// URL de production — à ajuster au domaine final.
// Sert au sitemap, aux URLs canoniques et aux métadonnées Open Graph.
const SITE = "https://www.bwebagence.com";

export default defineConfig({
	site: SITE,
  trailingSlash: "ignore",
  integrations: [
    sitemap({
      // Exclut les pages privées / techniques du sitemap (admin en noindex,
      // pages de retour paiement et de remerciement sans valeur SEO).
      filter: (page) =>
        !page.includes("/admin") &&
        !page.includes("/formations/paiement-retour") &&
        !page.includes("/merci"),
      // Retire le slash final : Vercel (`trailingSlash: false`) sert les URLs
      // sans slash et redirige (308) `/page/` -> `/page`. Sans ceci, le sitemap
      // listerait des URLs qui redirigent (« Page avec redirection » dans GSC),
      // désalignées des balises canoniques (elles aussi sans slash).
      serialize(item) {
        item.url = item.url.replace(/\/$/, "") || item.url;
        return item;
      },
    }),
  ],
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
  // Tailwind v4 + Starwind chargés UNIQUEMENT dans les layouts admin (voir
  // src/styles/starwind.css importé par AdminLayout/EditorLayout).
  // La vitrine n'importe pas ce CSS → aucun reset Tailwind en production.
  vite: {
    plugins: [tailwindcss()],
  },
});
