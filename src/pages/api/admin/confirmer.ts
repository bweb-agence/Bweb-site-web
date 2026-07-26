export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { sendEmail, confirmationEmail } from "../../../lib/email";
import { frDateLong } from "../../../lib/format";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/* Valide un paiement (réservé aux admins) puis envoie l'e-mail de confirmation. */
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createAdminClient();

  // Vérifie l'identité + l'appartenance à la liste admin
  const { data: userData } = await admin.auth.getUser(token);
  const email = userData?.user?.email;
  if (!email) return json({ ok: false, error: "unauthorized" }, 401);
  const { data: adminRow } = await admin.from("admins").select("email").ilike("email", email).maybeSingle();
  if (!adminRow) return json({ ok: false, error: "forbidden" }, 403);

  let bookingId: string, amountPaid: number | null;
  try {
    const body = await request.json();
    bookingId = body.booking_id;
    amountPaid = body.amount_paid ?? null;
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }
  if (!bookingId) return json({ ok: false, error: "invalid" }, 400);

  const { error } = await admin.rpc("confirm_booking", { p_booking_id: bookingId, p_amount_paid: amountPaid });
  if (error) return json({ ok: false, error: "server" }, 500);

  // Détails pour l'e-mail de confirmation
  const { data: b } = await admin
    .from("bookings")
    .select("reference, full_name, email, quantity, amount_paid, sessions(title, starts_at, venue, city), ticket_types(name)")
    .eq("id", bookingId)
    .maybeSingle();

  if (b?.email) {
    const s = (b as any).sessions;
    const c = confirmationEmail({
      reference: b.reference,
      full_name: b.full_name,
      session_title: s?.title || "",
      session_date: s?.starts_at ? frDateLong(s.starts_at) : null,
      session_venue: s?.venue ? `${s.venue}${s.city ? " · " + s.city : ""}` : null,
      ticket_name: (b as any).ticket_types?.name || null,
      quantity: b.quantity,
      amount: b.amount_paid,
    });
    await sendEmail({ to: b.email, subject: c.subject, html: c.html });
  }

  return json({ ok: true });
};
