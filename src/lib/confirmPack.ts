/* =========================================================
   Confirmation d'un ACHAT DE PACK après paiement (partagé).
   Symétrique de confirmBooking.ts, mais pour la table pack_purchases.
   Trouve l'achat lié à une référence de paiement, le passe en « confirmed »
   et envoie l'e-mail « pass parcours ». Idempotent (n'agit que sur un achat
   encore « pending »). Les billets nominatifs des formations partent plus tard,
   à l'enrôlement (cf. lib/enrollPack).
   ========================================================= */
import { createAdminClient } from "./supabaseAdmin";
import { sendEmail, packConfirmationEmail } from "./email";

/** État d'une opération de paiement encore non aboutie. */
export type PendingPaymentState = "attente" | "echoue" | "abandon";

/**
 * Met à jour l'état de paiement d'un achat de pack SANS le confirmer (paiement
 * non abouti). N'affecte qu'un achat encore « pending » : un achat déjà confirmé
 * (payé) n'est jamais rétrogradé.
 */
export async function setPackPaymentStatusByReference(
  reference: string,
  state: PendingPaymentState,
): Promise<void> {
  if (!reference) return;
  const admin = createAdminClient();
  await admin
    .from("pack_purchases")
    .update({ payment_status: state })
    .eq("payment_reference", reference)
    .eq("status", "pending");
}

export type PackConfirmResult = { confirmed: number; purchase: any | null };

export async function confirmPackByReference(reference: string): Promise<PackConfirmResult> {
  if (!reference) return { confirmed: 0, purchase: null };
  const admin = createAdminClient();

  const { data: purchases } = await admin
    .from("pack_purchases")
    .select("id, status, reference, full_name, email, amount_due, packs(title), pack_entitlements(formations(title))")
    .eq("payment_reference", reference);

  let confirmed = 0;
  let summary: any = null;
  for (const p of purchases || []) {
    const items = ((p as any).pack_entitlements || []).map((e: any) => ({
      title: e.formations?.title || "Formation",
      date: null as string | null,
    }));
    const packTitle = (p as any).packs?.title || "Parcours";

    if (p.status !== "confirmed") {
      // UPDATE direct (clé service) : le paiement est déjà vérifié en amont.
      const { error } = await admin
        .from("pack_purchases")
        .update({ status: "confirmed", payment_status: "paye", amount_paid: (p as any).amount_due ?? 0 })
        .eq("id", p.id)
        .eq("status", "pending");
      if (error) continue;
      confirmed++;

      if (p.email) {
        const c = packConfirmationEmail({
          reference: p.reference,
          full_name: p.full_name,
          pack_title: packTitle,
          amount: (p as any).amount_due ?? 0,
          items,
        });
        await sendEmail({ to: p.email, subject: c.subject, html: c.html });
      }
    }

    if (!summary) {
      summary = {
        reference: p.reference,
        full_name: p.full_name,
        pack_title: packTitle,
        amount_paid: (p as any).amount_due ?? 0,
        items,
      };
    }
  }

  return { confirmed, purchase: summary };
}
