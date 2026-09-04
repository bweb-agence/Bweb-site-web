/// <reference path="../.astro/types.d.ts" />

/* Pixel Meta : `fbq` est posé par le script tiers chargé dans MetaPixel.astro,
   et laissé en fonction vide hors production (cloisonnement par hôte). Il peut
   donc être absent — d'où l'optionnel : chaque appel doit vérifier avant de
   suivre un événement. */
interface Window {
  fbq?: (...args: unknown[]) => void;
}
