import { defineMiddleware } from "astro:middleware";

/**
 * Empêche la mise en cache des pages d'administration.
 *
 * Les pages /admin sont rendues à la demande (prerender=false) et sensibles :
 * on veut toujours servir la dernière version après un déploiement, sans que
 * le navigateur affiche un état périmé (source du « bug » de panneau qui ne
 * scrolle pas : ancien CSS/HTML servi depuis le cache).
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  if (context.url.pathname.startsWith("/admin")) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }
  return response;
});
