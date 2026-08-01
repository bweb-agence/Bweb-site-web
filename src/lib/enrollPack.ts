/* =========================================================
   Enrôlement automatique des détenteurs de pack.
   Dès qu'une date (session) est PUBLIÉE pour une formation incluse dans un
   pack, chaque détenteur d'un « droit à une place » (pack_entitlement) encore
   en attente pour cette formation est inscrit : on crée un booking CONFIRMÉ à
   0 F CFA (source = 'pack', place déjà payée via le pack), on lie le droit, et
   on envoie le billet nominatif + « ajouter à l'agenda ».

   Priorité pack : si le tarif est complet, on augmente sa capacité de +1 pour
   garantir la place (la contrainte sold <= capacity resterait sinon violée).

   Idempotent : ne traite qu'un droit encore « pending » d'un achat « confirmed ».
   ========================================================= */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, packEnrollmentEmail } from "./email";
import { eventFromSession, googleCalendarUrl } from "./calendar";
import { frDateLong } from "./format";

const SITE = "https://www.bwebagence.com";

/** Référence de billet pour un enrôlement pack (même forme que les autres billets). */
function enrolRef(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "BWB-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Enrôle les détenteurs de pack en attente pour UNE session publiée à venir. */
export async function enrollForSession(admin: SupabaseClient, sessionId: string): Promise<number> {
  if (!sessionId) return 0;

  const { data: s } = await admin
    .from("sessions")
    .select("id, formation_id, title, slug, starts_at, ends_at, venue, address, city, mode, meeting_url, meeting_info, status, ticket_types(id, price, capacity, sold, sort)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s || !(s as any).formation_id) return 0;
  if (!["published", "full"].includes((s as any).status)) return 0;
  if (new Date((s as any).starts_at).getTime() < Date.now()) return 0; // jamais une session passée

  // Droits en attente pour cette formation, dont l'achat de pack est confirmé.
  const { data: ents } = await admin
    .from("pack_entitlements")
    .select("id, pack_purchases!inner(id, status, full_name, email, phone, attendance_mode)")
    .eq("formation_id", (s as any).formation_id)
    .eq("status", "pending")
    .eq("pack_purchases.status", "confirmed");
  if (!ents || ents.length === 0) return 0;

  // Tarif cible : le premier par ordre d'affichage.
  const tts = ((s as any).ticket_types || []).slice().sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
  const tt = tts[0];
  if (!tt) return 0; // aucune grille tarifaire → impossible d'enrôler

  let count = 0;
  for (const e of ents) {
    const p = (e as any).pack_purchases;
    try {
      // Priorité pack : garantir une place (relire le tarif, augmenter la capacité si complet).
      const { data: fresh } = await admin.from("ticket_types").select("capacity, sold").eq("id", tt.id).maybeSingle();
      const cap = (fresh as any)?.capacity ?? tt.capacity;
      const sold = (fresh as any)?.sold ?? tt.sold;
      if (sold + 1 > cap) {
        await admin.from("ticket_types").update({ capacity: sold + 1 }).eq("id", tt.id);
      }

      const mode = (s as any).mode;
      const attendance = mode === "en_ligne" ? "en_ligne" : mode === "hybride" ? p.attendance_mode || "presentiel" : "presentiel";

      const ref = enrolRef();
      const { data: bk, error: bErr } = await admin
        .from("bookings")
        .insert({
          reference: ref,
          session_id: (s as any).id,
          ticket_type_id: tt.id,
          quantity: 1,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          amount_due: 0,
          amount_paid: 0,
          is_deposit: false,
          payment_method: null,
          status: "confirmed", // → le trigger trg_sync_ticket_sold consomme un siège
          source: "pack",
          attendance_mode: attendance,
        })
        .select("id")
        .single();
      if (bErr || !bk) continue;

      // Lier le droit (n'agit que s'il est encore pending → anti-doublon).
      const { data: upd } = await admin
        .from("pack_entitlements")
        .update({ status: "enrolled", booking_id: (bk as any).id, enrolled_session_id: (s as any).id })
        .eq("id", (e as any).id)
        .eq("status", "pending")
        .select("id");
      if (!upd || upd.length === 0) continue; // déjà pris par un autre passage
      count++;

      if (p.email) {
        // Places encore en attente dans ce pack (pour le « il vous reste N places »).
        const { count: remaining } = await admin
          .from("pack_entitlements")
          .select("id", { count: "exact", head: true })
          .eq("purchase_id", p.id)
          .eq("status", "pending");

        const billet = {
          reference: ref,
          full_name: p.full_name,
          session_title: (s as any).title || "",
          session_date: (s as any).starts_at ? frDateLong((s as any).starts_at) : null,
          session_venue: (s as any).venue ? `${(s as any).venue}${(s as any).city ? " · " + (s as any).city : ""}` : null,
          ticket_name: null,
          quantity: 1,
          amount: 0,
          balance: 0,
          pdf_url: `${SITE}/api/billet?ref=${encodeURIComponent(ref)}`,
          calendarGoogle: (s as any).starts_at ? googleCalendarUrl(eventFromSession(s as any)) : null,
          calendarIcs: (s as any).id ? `${SITE}/api/calendrier?s=${(s as any).id}` : null,
          remaining: remaining ?? 0,
        };
        const c = packEnrollmentEmail(billet);
        await sendEmail({ to: p.email, subject: c.subject, html: c.html });
      }
    } catch {
      // on continue : les droits suivants (et le prochain passage) seront tentés
    }
  }

  return count;
}

/** Balaye toutes les sessions publiées à venir liées à un pack et enrôle les détenteurs. */
export async function enrollDuePackHolders(admin: SupabaseClient): Promise<{ sessions: number; enrolled: number }> {
  const { data: items } = await admin.from("pack_items").select("formation_id");
  const fids = [...new Set((items || []).map((i: any) => i.formation_id).filter(Boolean))];
  if (fids.length === 0) return { sessions: 0, enrolled: 0 };

  const { data: sess } = await admin
    .from("sessions")
    .select("id")
    .in("formation_id", fids)
    .in("status", ["published", "full"])
    .gte("starts_at", new Date().toISOString());

  let enrolled = 0;
  for (const s of sess || []) enrolled += await enrollForSession(admin, (s as any).id);
  return { sessions: (sess || []).length, enrolled };
}
