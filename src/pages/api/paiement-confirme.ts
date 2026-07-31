export const prerender = false;

import type { APIRoute } from "astro";
import { confirmBookingsByReference, setPaymentStatusByReference } from "../../lib/confirmBooking";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/**
 * Confirme une (ou plusieurs) réservation(s) après un paiement en ligne.
 * Appelé par la page de retour (et les webhooks). SÉCURITÉ : re-vérifie le
 * statut du paiement auprès de la passerelle avant toute confirmation.
 *  - gateway = "paystack"  → vérifie via l'API Paystack (numéros +225) ;
 *  - sinon (Money Fusion)  → vérifie via le relais à IP fixe (Hostinger).
 * Idempotent : ne confirme/n'e-maile qu'une réservation encore "pending".
 */
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  let token = "";
  let gateway = "money_fusion";
  try {
    const b = await request.json();
    token = b?.token || "";
    gateway = b?.gateway === "paystack" ? "paystack" : "money_fusion";
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (!token) return json({ ok: false, error: "no_token" }, 400);

  // 1) Re-vérifier le paiement auprès de la passerelle.
  let statut = "";
  let montant: number | null = null;
  let paid = false;

  if (gateway === "paystack") {
    const secret = import.meta.env.PAYSTACK_SECRET_KEY;
    if (!secret) return json({ ok: false, error: "no_payment_api" }, 500);
    try {
      const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(token)}`, {
        headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
      });
      const s: any = await r.json();
      statut = String(s?.data?.status || "").toLowerCase();
      montant = s?.data?.amount != null ? Number(s.data.amount) / 100 : null; // XOF = subunit/100
      paid = statut === "success";
    } catch {
      return json({ ok: false, error: "verify_failed" }, 502);
    }
  } else {
    const payApi = import.meta.env.PAYMENT_API_URL;
    if (!payApi) return json({ ok: false, error: "no_payment_api" }, 500);
    try {
      const r = await fetch(`${payApi.replace(/\/+$/, "")}/status.php?token=${encodeURIComponent(token)}`, {
        headers: { Accept: "application/json" },
      });
      const s: any = await r.json();
      statut = String(s?.statut || "").toLowerCase();
      montant = Number(s?.montant) || null;
      paid = ["paid", "payé", "paye", "success", "successful"].includes(statut);
    } catch {
      return json({ ok: false, error: "verify_failed" }, 502);
    }
  }

  // Pas encore payé : rien à confirmer, mais on enregistre l'état réel de
  // l'opération pour l'admin (attente / échoué / abandon). Le libellé de la
  // passerelle décide (Paystack : success/ongoing/pending/failed/abandoned/reversed).
  if (!paid) {
    const ongoing = ["ongoing", "pending", "processing", "queued", "en attente", "en_cours", ""].includes(statut);
    const abandoned = ["abandoned", "abandon", "cancelled", "canceled", "annulé", "annule"].includes(statut);
    if (!ongoing) {
      await setPaymentStatusByReference(token, abandoned ? "abandon" : "echoue");
    }
    return json({ ok: true, statut, montant, confirmed: 0 });
  }

  // 2) Confirmer les réservations liées à cette référence de paiement.
  const { confirmed, booking } = await confirmBookingsByReference(token);
  return json({ ok: true, statut, montant, confirmed, booking });
};
