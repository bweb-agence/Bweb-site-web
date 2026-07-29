/* =========================================================
   Confirmation d'une réservation après paiement (partagé).
   Trouve les réservations liées à une référence de paiement
   (payment_reference = jeton Money Fusion OU référence Paystack),
   les passe en « confirmed » (→ le trigger réduit les places),
   envoie l'e-mail + billet PDF. Idempotent (ne traite que les
   réservations encore « pending »).
   ========================================================= */
import { createAdminClient } from "./supabaseAdmin";
import { sendEmail, confirmationEmail } from "./email";
import { billetPdfBuffer } from "./billetPdf";
import { frDateLong } from "./format";

const SITE = "https://www.bwebagence.com";

export type ConfirmResult = { confirmed: number; booking: any | null };

export async function confirmBookingsByReference(reference: string): Promise<ConfirmResult> {
  if (!reference) return { confirmed: 0, booking: null };
  const admin = createAdminClient();

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, status, reference, full_name, email, quantity, amount_due, is_deposit, sessions(title, starts_at, venue, city), ticket_types(name)")
    .eq("payment_reference", reference);

  let confirmed = 0;
  for (const b of bookings || []) {
    if (b.status === "confirmed") continue; // idempotent

    const due = (b as any).amount_due ?? 0;
    const amountPaid = (b as any).is_deposit ? Math.max(1, Math.ceil(due / 2)) : due;
    // UPDATE direct (clé service, contourne le RLS) : le paiement est déjà vérifié
    // en amont. Le passage à « confirmed » déclenche la réduction des places (trigger).
    const { error } = await admin
      .from("bookings")
      .update({ status: "confirmed", amount_paid: amountPaid })
      .eq("id", b.id)
      .eq("status", "pending");
    if (error) continue;
    confirmed++;

    if (b.email) {
      const s = (b as any).sessions;
      const balance = (b as any).is_deposit ? Math.max(0, due - amountPaid) : 0;
      const billet = {
        reference: b.reference,
        full_name: b.full_name,
        session_title: s?.title || "",
        session_date: s?.starts_at ? frDateLong(s.starts_at) : null,
        session_venue: s?.venue ? `${s.venue}${s.city ? " · " + s.city : ""}` : null,
        ticket_name: (b as any).ticket_types?.name || null,
        quantity: b.quantity,
      };
      const c = confirmationEmail({
        ...billet,
        amount: amountPaid,
        balance,
        pdf_url: `${SITE}/api/billet?token=${encodeURIComponent(reference)}`,
      });
      let attachments;
      try {
        const pdf = await billetPdfBuffer({ ...billet, amount_paid: amountPaid, balance, is_deposit: !!(b as any).is_deposit });
        attachments = [{ filename: `billet-${b.reference}.pdf`, content: pdf.toString("base64"), type: "application/pdf" }];
      } catch {
        attachments = undefined;
      }
      await sendEmail({ to: b.email, subject: c.subject, html: c.html, attachments });
    }
  }

  // Résumé (dispo même au rafraîchissement, quand tout est déjà confirmé).
  const first: any = (bookings || [])[0];
  let booking: unknown = null;
  if (first) {
    const s = first.sessions;
    const due = first.amount_due ?? 0;
    const paid = first.is_deposit ? Math.max(1, Math.ceil(due / 2)) : due;
    booking = {
      reference: first.reference,
      full_name: first.full_name,
      session_title: s?.title || "",
      session_date: s?.starts_at ? frDateLong(s.starts_at) : null,
      session_venue: s?.venue ? `${s.venue}${s.city ? " · " + s.city : ""}` : null,
      ticket_name: first.ticket_types?.name || null,
      quantity: first.quantity ?? 1,
      is_deposit: !!first.is_deposit,
      amount_paid: paid,
      balance: first.is_deposit ? Math.max(0, due - paid) : 0,
    };
  }

  return { confirmed, booking };
}
