export const prerender = false;

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabaseAdmin";
import { sendEmail, confirmationEmail } from "../../lib/email";
import { eventFromSession, googleCalendarUrl } from "../../lib/calendar";
import { billetPdfBuffer } from "../../lib/billetPdf";
import { frDateLong } from "../../lib/format";

const SITE = "https://www.bwebagence.com";
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

const ERR: Record<string, string> = {
  forbidden: "Accès refusé.",
  invalid_quantity: "Quantité invalide.",
  invalid_name: "Nom du participant requis.",
  invalid_email: "E-mail du participant invalide.",
  invalid_payment_method: "Moyen de paiement invalide.",
  ticket_not_found: "Tarif introuvable.",
  session_unavailable: "Cette session n'est pas ouverte à la réservation.",
  sold_out: "Plus assez de places pour ce tarif.",
};

/**
 * Réservation MANUELLE saisie par un commercial (paiement Mobile Money/espèces
 * encaissé hors site). Crée une réservation confirmée + payée (consomme une place)
 * via la RPC create_manual_booking, puis envoie le billet par e-mail au participant.
 * Réservé au staff : la RPC est appelée AVEC le jeton de l'appelant (is_staff() +
 * registered_by = son e-mail).
 */
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !url || !anon) return json({ ok: false, error: "unauthorized" }, 401);

  let b: any;
  try { b = await request.json(); } catch { return json({ ok: false, error: "invalid" }, 400); }

  const ticketTypeId = String(b?.ticket_type_id || "").trim();
  const quantity = Math.max(1, Math.min(20, parseInt(b?.quantity) || 1));
  const fullName = String(b?.full_name || "").trim();
  const email = String(b?.email || "").trim();
  const phone = String(b?.phone || "").trim();
  const method = String(b?.payment_method || "");
  const attRaw = String(b?.attendance_mode || "");
  const attendance = ["presentiel", "en_ligne"].includes(attRaw) ? attRaw : null;
  if (!ticketTypeId) return json({ ok: false, error: "invalid" }, 400);

  // Client à la portée du JWT de l'appelant (pour is_staff() + registered_by).
  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: isStaff } = await asUser.rpc("is_staff");
  if (isStaff !== true) return json({ ok: false, error: "forbidden" }, 403);

  const { data: res, error } = await asUser.rpc("create_manual_booking", {
    p_ticket_type_id: ticketTypeId,
    p_quantity: quantity,
    p_full_name: fullName,
    p_email: email,
    p_phone: phone || null,
    p_payment_method: method,
    p_attendance_mode: attendance,
    p_amount_paid: b?.amount_paid != null ? Math.max(0, parseInt(b.amount_paid) || 0) : null,
  });
  if (error) return json({ ok: false, error: "server" }, 500);
  if (!res?.ok) return json({ ok: false, error: res?.error || "server", message: ERR[res?.error] || "Erreur.", remaining: res?.remaining });

  // Billet par e-mail (service key : lecture fiable + Bird).
  const admin = createAdminClient();
  const { data: bk } = await admin
    .from("bookings")
    .select("reference, full_name, email, quantity, amount_paid, sessions(id, title, slug, starts_at, ends_at, venue, address, city, mode, meeting_url, meeting_info), ticket_types(name)")
    .eq("id", res.booking_id)
    .maybeSingle();

  if (bk?.email) {
    const s = (bk as any).sessions;
    const billet = {
      reference: bk.reference,
      full_name: bk.full_name,
      session_title: s?.title || "",
      session_date: s?.starts_at ? frDateLong(s.starts_at) : null,
      session_venue: s?.venue ? `${s.venue}${s.city ? " · " + s.city : ""}` : null,
      ticket_name: (bk as any).ticket_types?.name || null,
      quantity: bk.quantity,
    };
    const c = confirmationEmail({
      ...billet,
      amount: (bk as any).amount_paid ?? 0,
      balance: 0,
      pdf_url: `${SITE}/api/billet?ref=${encodeURIComponent(bk.reference)}`,
      calendarGoogle: s?.starts_at ? googleCalendarUrl(eventFromSession(s)) : null,
      calendarIcs: s?.id ? `${SITE}/api/calendrier?s=${s.id}` : null,
    });
    let attachments;
    try {
      const pdf = await billetPdfBuffer({ ...billet, amount_paid: (bk as any).amount_paid ?? 0, balance: 0, is_deposit: false });
      attachments = [{ filename: `billet-${bk.reference}.pdf`, content: pdf.toString("base64"), type: "application/pdf" }];
    } catch { attachments = undefined; }
    try { await sendEmail({ to: bk.email, subject: c.subject, html: c.html, attachments }); } catch { /* non bloquant */ }
  }

  return json({ ok: true, reference: res.reference });
};
