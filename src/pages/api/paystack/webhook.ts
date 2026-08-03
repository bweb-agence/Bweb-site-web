export const prerender = false;

import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { confirmBookingsByReference } from "../../../lib/confirmBooking";
import { confirmPackByReference } from "../../../lib/confirmPack";

/**
 * Webhook Paystack : confirme la réservation même si l'acheteur ferme l'onglet
 * avant le retour. Sécurité : signature HMAC-SHA512 du corps brut avec la clé
 * secrète (en-tête x-paystack-signature). À configurer dans le dashboard Paystack :
 * https://www.bwebagence.com/api/paystack/webhook
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.PAYSTACK_SECRET_KEY;
  const raw = await request.text();
  const sig = request.headers.get("x-paystack-signature") || "";
  if (!secret) return new Response("not_configured", { status: 200 });

  const hash = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  if (hash !== sig) return new Response("invalid signature", { status: 401 });

  try {
    const event = JSON.parse(raw);
    if (event?.event === "charge.success" && event?.data?.reference) {
      const ref = String(event.data.reference);
      await confirmBookingsByReference(ref);
      await confirmPackByReference(ref); // achat de pack (idempotent, no-op si non concerné)
    }
  } catch {
    /* on renvoie 200 quand même : Paystack ne doit pas réessayer indéfiniment */
  }
  return new Response("ok", { status: 200 });
};
