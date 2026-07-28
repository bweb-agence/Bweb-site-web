export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../lib/supabaseAdmin";
import { sendEmail, confirmationEmail } from "../../lib/email";
import { billetPdfBuffer } from "../../lib/billetPdf";
import { frDateLong } from "../../lib/format";

const SITE = "https://www.bwebagence.com";

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
    .select("id, status, reference, full_name, email, quantity, amount_due, is_deposit, sessions(title, starts_at, venue, city), ticket_types(name)")
    .eq("payment_reference", token);

  let confirmed = 0;
  for (const b of bookings || []) {
    if (b.status === "confirmed") continue; // idempotent : déjà fait

    // Acompte 50 % réglé en ligne → amount_paid = moitié ; solde dû sur place.
    const due = (b as any).amount_due ?? 0;
    const amountPaid = (b as any).is_deposit ? Math.max(1, Math.ceil(due / 2)) : due;
    // Mise à jour directe (clé service, contourne le RLS) : la RPC confirm_booking
    // exige un admin connecté (is_admin) — inadapté à ce flux serveur automatique,
    // où le paiement a déjà été vérifié auprès de Money Fusion.
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
        pdf_url: `${SITE}/api/billet?token=${encodeURIComponent(token)}`,
      });
      // Billet PDF joint (échec silencieux : l'e-mail part quand même).
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

  // Résumé de la réservation pour l'affichage du billet sur la page de retour
  // (construit indépendamment de la boucle : reste dispo au rafraîchissement,
  // quand toutes les réservations sont déjà "confirmed").
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

  return json({ ok: true, statut, montant, confirmed, booking });
};
