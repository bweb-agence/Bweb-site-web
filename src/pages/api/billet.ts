export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../lib/supabaseAdmin";
import { billetPdfBuffer } from "../../lib/billetPdf";
import { frDateLong } from "../../lib/format";

/**
 * Billet de formation en PDF (téléchargement).
 * Recherche prioritaire par jeton de paiement (non devinable, utilisé par la
 * page de retour) ; repli par référence pour le lien de l'e-mail admin.
 * GET /api/billet?token=xxxx   ou   /api/billet?ref=BWB-0011
 */
export const GET: APIRoute = async ({ url }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return new Response("indisponible", { status: 503 });

  const token = (url.searchParams.get("token") || "").trim();
  const ref = (url.searchParams.get("ref") || "").trim();
  if (!token && !/^[A-Za-z0-9\-]{3,40}$/.test(ref)) return new Response("paramètre manquant", { status: 400 });

  const admin = createAdminClient();
  const sel =
    "reference, full_name, quantity, amount_due, amount_paid, is_deposit, status, sessions(title, starts_at, venue, city), ticket_types(name)";
  const query = admin.from("bookings").select(sel);
  const { data } = token
    ? await query.eq("payment_reference", token).limit(1)
    : await query.eq("reference", ref).limit(1);

  const b: any = (data || [])[0];
  if (!b) return new Response("billet introuvable", { status: 404 });

  const s = b.sessions;
  const due = b.amount_due ?? 0;
  const paid = b.amount_paid ?? (b.is_deposit ? Math.max(1, Math.ceil(due / 2)) : due);

  const pdf = await billetPdfBuffer({
    reference: b.reference,
    full_name: b.full_name,
    session_title: s?.title || "",
    session_date: s?.starts_at ? frDateLong(s.starts_at) : null,
    session_venue: s?.venue ? `${s.venue}${s.city ? " · " + s.city : ""}` : null,
    ticket_name: b.ticket_types?.name || null,
    quantity: b.quantity,
    amount_paid: paid,
    is_deposit: !!b.is_deposit,
    balance: b.is_deposit ? Math.max(0, due - paid) : 0,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="billet-${b.reference}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
};
