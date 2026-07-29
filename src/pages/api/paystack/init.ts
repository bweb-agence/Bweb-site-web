export const prerender = false;

import type { APIRoute } from "astro";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/**
 * Initialise une transaction Paystack (numéros +225 / Côte d'Ivoire).
 * Renvoie l'URL de paiement hébergée + la référence Paystack (stockée ensuite
 * comme payment_reference des réservations). Montant en XOF → sous-unité ×100.
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.PAYSTACK_SECRET_KEY;
  if (!secret) return json({ ok: false, error: "not_configured" });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  const amount = Math.round(Number(body?.amount) || 0);
  const email = String(body?.email || "").trim();
  if (amount < 1 || !email) return json({ ok: false, error: "invalid" }, 400);

  const origin = new URL(request.url).origin;
  try {
    const r = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: amount * 100, // XOF → sous-unité (Paystack multiplie par 100)
        currency: "XOF",
        channels: ["mobile_money", "card"],
        callback_url: `${origin}/formations/paiement-retour?gw=paystack`,
        metadata: {
          session_id: body?.session_id || null,
          nom: body?.name || null,
          telephone: body?.phone || null,
          article: body?.title || "Formation Bweb",
        },
      }),
    });
    const j: any = await r.json();
    if (!j?.status || !j?.data?.authorization_url) return json({ ok: false, error: "init_failed" }, 502);
    return json({ ok: true, url: j.data.authorization_url, reference: j.data.reference });
  } catch {
    return json({ ok: false, error: "init_failed" }, 502);
  }
};
