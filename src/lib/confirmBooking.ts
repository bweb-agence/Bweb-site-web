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
import { eventFromSession, googleCalendarUrl } from "./calendar";
import { billetPdfBuffer } from "./billetPdf";
import { frDateLong } from "./format";

const SITE = "https://www.bwebagence.com";

export type ConfirmResult = { confirmed: number; booking: any | null; underpaid?: boolean };

/** État d'une opération de paiement encore non aboutie. */
export type PendingPaymentState = "attente" | "echoue" | "abandon";

/**
 * Met à jour l'état de paiement des réservations liées à une référence, SANS
 * les confirmer (paiement non abouti). N'affecte que les réservations encore
 * « pending » : une réservation déjà confirmée (payée) n'est jamais rétrogradée.
 */
export async function setPaymentStatusByReference(
  reference: string,
  state: PendingPaymentState,
): Promise<void> {
  if (!reference) return;
  const admin = createAdminClient();
  await admin
    .from("bookings")
    .update({ payment_status: state })
    .eq("payment_reference", reference)
    .eq("status", "pending");
}

export async function confirmBookingsByReference(
  reference: string,
  paidAmount?: number | null,
): Promise<ConfirmResult> {
  if (!reference) return { confirmed: 0, booking: null };
  const admin = createAdminClient();

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, status, reference, full_name, email, quantity, amount_due, is_deposit, sessions(id, slug, title, starts_at, ends_at, venue, address, city, mode, meeting_url, meeting_info), ticket_types(name)")
    .eq("payment_reference", reference);

  // Garde-fou montant (defense-in-depth) : le montant réellement encaissé
  // (renvoyé par la passerelle) doit couvrir le total attendu pour cette
  // référence — acomptes inclus. En cas de manque clair, on NE confirme pas et
  // on laisse la (les) réservation(s) en « pending » pour revue admin. Si le
  // montant est inconnu (null/0), le contrôle est ignoré (jamais de faux refus).
  if (paidAmount != null && paidAmount > 0) {
    const required = (bookings || [])
      .filter((b) => b.status !== "confirmed")
      .reduce((sum, b) => {
        const due = (b as any).amount_due ?? 0;
        return sum + ((b as any).is_deposit ? Math.max(1, Math.ceil(due / 2)) : due);
      }, 0);
    // Tolérance 1 % (arrondis / frais passerelle). En dessous → anomalie.
    if (required > 0 && paidAmount + Math.max(1, required * 0.01) < required) {
      console.warn(`[confirmBooking] montant insuffisant ref=${reference} payé=${paidAmount} attendu=${required} — non confirmé`);
      return { confirmed: 0, booking: null, underpaid: true };
    }
  }

  let confirmed = 0;
  for (const b of bookings || []) {
    if (b.status === "confirmed") continue; // idempotent

    const due = (b as any).amount_due ?? 0;
    const amountPaid = (b as any).is_deposit ? Math.max(1, Math.ceil(due / 2)) : due;
    // UPDATE direct (clé service, contourne le RLS) : le paiement est déjà vérifié
    // en amont. Le passage à « confirmed » déclenche la réduction des places (trigger).
    const { error } = await admin
      .from("bookings")
      .update({ status: "confirmed", amount_paid: amountPaid, payment_status: "paye" })
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
      // « Ajouter à mon agenda » (Google + .ics).
      const calGoogle = s?.starts_at ? googleCalendarUrl(eventFromSession(s)) : null;
      const calIcs = s?.id ? `${SITE}/api/calendrier?s=${s.id}` : null;
      const c = confirmationEmail({
        ...billet,
        amount: amountPaid,
        balance,
        pdf_url: `${SITE}/api/billet?token=${encodeURIComponent(reference)}`,
        calendarGoogle: calGoogle,
        calendarIcs: calIcs,
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
      calendarGoogle: s?.starts_at ? googleCalendarUrl(eventFromSession(s)) : null,
      calendarIcs: s?.id ? `${SITE}/api/calendrier?s=${s.id}` : null,
    };
  }

  return { confirmed, booking };
}
