export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../lib/supabaseAdmin";
import { sendEmail, confirmationEmail } from "../../lib/email";
import { frDateLong } from "../../lib/format";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/**
 * Confirme une (ou plusieurs) réservation(s) après un paiement Money Fusion.
 * Appelé par le webhook (relais Hostinger) ET par la page de retour.
 * SÉCURITÉ : re-vérifie le statut du paiement auprès de Money Fusion (via le
 * relais à IP fixe) avant toute confirmation. Idempotent : ne confirme/n'e-maile
 * qu'une réservation encore "pending".
 */
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const payApi = import.meta.env.PAYMENT_API_URL;
  if (!payApi) return json({ ok: false, error: "no_payment_api" }, 500);

  let token = "";
  try {
    token = (await request.json())?.token || "";
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (!token) return json({ ok: false, error: "no_token" }, 400);

  // 1) Re-vérifier le paiement auprès de Money Fusion (via le relais IP fixe).
  let statut = "";
  let montant: number | null = null;
  try {
    const r = await fetch(`${payApi.replace(/\/+$/, "")}/status.php?token=${encodeURIComponent(token)}`, {
      headers: { Accept: "application/json" },
    });
    const s: any = await r.json();
    statut = String(s?.statut || "").toLowerCase();
    montant = Number(s?.montant) || null;
  } catch {
    return json({ ok: false, error: "verify_failed" }, 502);
  }

  // Pas encore payé : rien à confirmer (le webhook/retour rappellera).
  const paid = ["paid", "payé", "paye", "success", "successful"].includes(statut);
  if (!paid) return json({ ok: true, statut, montant, confirmed: 0 });

  const admin = createAdminClient();

  // Les réservations liées à ce paiement portent le jeton Money Fusion en
  // payment_reference (posé à la création après acceptation du paiement).
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, status, reference, full_name, email, quantity, amount_due, sessions(title, starts_at, venue, city), ticket_types(name)")
    .eq("payment_reference", token);

  let confirmed = 0;
  for (const b of bookings || []) {
    if (b.status === "confirmed") continue; // idempotent : déjà fait

    const { error } = await admin.rpc("confirm_booking", {
      p_booking_id: b.id,
      p_amount_paid: (b as any).amount_due ?? null,
    });
    if (error) continue;
    confirmed++;

    if (b.email) {
      const s = (b as any).sessions;
      const c = confirmationEmail({
        reference: b.reference,
        full_name: b.full_name,
        session_title: s?.title || "",
        session_date: s?.starts_at ? frDateLong(s.starts_at) : null,
        session_venue: s?.venue ? `${s.venue}${s.city ? " · " + s.city : ""}` : null,
        ticket_name: (b as any).ticket_types?.name || null,
        quantity: b.quantity,
        amount: (b as any).amount_due ?? montant,
      });
      await sendEmail({ to: b.email, subject: c.subject, html: c.html });
    }
  }

  return json({ ok: true, statut, montant, confirmed });
};
