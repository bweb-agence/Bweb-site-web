/* =========================================================
   Rappels d'évènement (J-5 / J-3 / J-1 / J-0) + demande d'avis (J+1).
   Logique partagée, appelée par /api/cron/rappels (manuel / Hostinger) ET par
   le cron Vercel /api/cron/campagnes (06h) — évite d'ajouter un 3ᵉ cron Vercel
   (plan Hobby limité). Uniquement aux réservations confirmées (payées, acompte
   compris). Anti-doublon via booking_emails (booking_id + kind). Idempotent.
   ========================================================= */
import { sendEmail, reminderEmail, reviewRequestEmail } from "./email";
import { eventFromSession, googleCalendarUrl } from "./calendar";
import { frDateLong, frTime } from "./format";

const SITE = "https://www.bwebagence.com";

const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const diffDays = (target: string, ref: Date) => Math.round((startOfDay(new Date(target)) - startOfDay(ref)) / 86400000);

// Écart (jours) → type d'e-mail à envoyer ce matin.
export function kindForDiff(diff: number): string | null {
  if (diff === 5) return "reminder_5d";
  if (diff === 3) return "reminder_3d";
  if (diff === 1) return "reminder_1d";
  if (diff === 0) return "reminder_0d";
  if (diff === -1) return "review_request"; // le lendemain
  return null;
}

export async function sendDueRappels(admin: any): Promise<{ candidates: number; sent: number }> {
  const now = new Date();
  const from = new Date(startOfDay(now) - 2 * 86400000).toISOString(); // pour J+1
  const to = new Date(startOfDay(now) + 7 * 86400000).toISOString();   // pour J-5

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, reference, full_name, email, session_id, sessions(id, slug, title, starts_at, ends_at, mode, venue, address, city, meeting_url, meeting_info, status)")
    .eq("status", "confirmed")
    .not("email", "is", null)
    .gte("sessions.starts_at", from)
    .lte("sessions.starts_at", to);

  const rows = (bookings || []).filter((b: any) => b.sessions && b.sessions.starts_at && b.sessions.status !== "cancelled");

  const ids = rows.map((b: any) => b.id);
  const already = new Set<string>();
  if (ids.length) {
    const { data: se } = await admin.from("booking_emails").select("booking_id, kind").in("booking_id", ids);
    for (const r of se || []) already.add((r as any).booking_id + "|" + (r as any).kind);
  }

  let sent = 0;
  const toRecord: { booking_id: string; kind: string }[] = [];
  for (const b of rows as any[]) {
    const s = b.sessions;
    const kind = kindForDiff(diffDays(s.starts_at, now));
    if (!kind || already.has(b.id + "|" + kind)) continue;

    let mail: { subject: string; html: string };
    if (kind === "review_request") {
      mail = reviewRequestEmail({ full_name: b.full_name, session_title: s.title, review_url: `${SITE}/avis/${s.slug}` });
    } else {
      mail = reminderEmail(kind, {
        full_name: b.full_name,
        reference: b.reference,
        session_title: s.title,
        session_date: `${frDateLong(s.starts_at)} à ${frTime(s.starts_at)}`,
        mode: s.mode,
        venue: s.venue,
        address: s.address,
        meeting_url: s.meeting_url,
        meeting_info: s.meeting_info,
        calendarGoogle: googleCalendarUrl(eventFromSession(s)),
        calendarIcs: `${SITE}/api/calendrier?s=${s.id}`,
      });
    }

    const ok = await sendEmail({ to: b.email, subject: mail.subject, html: mail.html });
    if (ok) { sent++; toRecord.push({ booking_id: b.id, kind }); }
  }

  if (toRecord.length) await admin.from("booking_emails").insert(toRecord);
  return { candidates: rows.length, sent };
}
