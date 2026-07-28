export const prerender = false;

import type { APIRoute } from "astro";
import QRCode from "qrcode";

/**
 * QR du billet (image PNG) — encode la référence (code d'entrée, vérifié à
 * l'accueil). Utilisé dans l'e-mail de confirmation (les clients mail bloquent
 * le SVG et les data-URI, il faut donc une image hébergée).
 * GET /api/billet-qr?ref=BWB-0011
 */
export const GET: APIRoute = async ({ url }) => {
  const ref = (url.searchParams.get("ref") || "").trim();
  if (!/^[A-Za-z0-9\-]{3,40}$/.test(ref)) return new Response("bad ref", { status: 400 });

  const png = await QRCode.toBuffer(ref, {
    margin: 1,
    width: 300,
    color: { dark: "#050a3aff", light: "#ffffffff" },
  });

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
