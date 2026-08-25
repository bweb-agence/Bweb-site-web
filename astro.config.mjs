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
        !page.includes("/merci") &&
        // Page d'après-achat du parcours : en noindex, donc la lister ici
        // produirait une erreur « exclue par la balise noindex » dans GSC.
        !page.includes("/parcours-initiation/bienvenue"),
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
  // 60 s = plafond du plan Hobby. Sert la synchro ACQ Hub, qui traite des
  // contacts par vagues : sans cela la fonction est coupée vers 15 s et la
  // passe perd son compte-rendu. C'est un PLAFOND, pas une réservation — les
  // autres routes répondent toujours aussi vite. Le budget interne de la
  // synchro (50 s) reste sous ce plafond pour avoir le temps de répondre.
  adapter: vercel({ maxDuration: 60 }),
  build: {
    // Génère /services/index.html -> URL propre /services
    format: "directory",

    /* Le style part AVEC le document, au lieu d'être réclamé après coup.
       Mesuré sur la landing du webinaire : le document arrivait à 543 ms, et
       les quatre feuilles ne finissaient qu'entre 979 et 1 022 ms — soit
       ~440 ms d'attente supplémentaire avant que la page puisse peindre.
       Elles étaient déjà téléchargées en parallèle (HTTP/2), donc les FUSIONNER
       n'aurait gagné que la quarantaine de millisecondes d'écart entre la
       première et la dernière : c'est l'aller-retour lui-même qu'il fallait
       supprimer, pas le nombre de fichiers.

       Le prix : ~30 Ko compressés de style dans CHAQUE document, et plus de
       mise en cache du style d'une page à l'autre. C'est le bon échange ici —
       la page qui compte reçoit du trafic publicitaire, où presque chaque
       visite est une première visite. */
    inlineStylesheets: "always",
  },
  // Tailwind v4 + Starwind chargés UNIQUEMENT dans les layouts admin (voir
  // src/styles/starwind.css importé par AdminLayout/EditorLayout).
  // La vitrine n'importe pas ce CSS → aucun reset Tailwind en production.
  vite: {
    plugins: [tailwindcss()],
  },
});
