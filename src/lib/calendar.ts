/* =========================================================
   BWEB — « Ajouter à mon agenda » : Google Agenda (URL) + .ics (Apple/Outlook).
   Construit un évènement à partir d'une session, en adaptant lieu/description
   au mode (présentiel / en ligne / hybride).
   ========================================================= */

const SITE = "https://www.bwebagence.com";

export type CalSession = {
  title: string;
  slug?: string | null;
  starts_at: string;
  ends_at?: string | null;
  mode?: string | null;
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  meeting_url?: string | null;
  meeting_info?: string | null;
};

export type CalEvent = { title: string; start: Date; end: Date; description: string; location: string; url: string };

const isOnline = (m?: string | null) => m === "en_ligne";
const isHybrid = (m?: string | null) => m === "hybride";

/** Construit l'évènement calendrier à partir d'une session (durée par défaut 3 h). */
export function eventFromSession(s: CalSession): CalEvent {
  const start = new Date(s.starts_at);
  const end = s.ends_at ? new Date(s.ends_at) : new Date(start.getTime() + 3 * 3600 * 1000);
  const sessionUrl = s.slug ? `${SITE}/formations/session/${s.slug}` : `${SITE}/formations`;

  let location: string;
  if (isOnline(s.mode)) location = "En ligne — visioconférence";
  else location = [s.venue, s.address, s.city].filter(Boolean).join(", ") || "Espace de formation Bweb · Cocody, Abidjan";
  if (isHybrid(s.mode)) location += " (ou en ligne)";

  const lines: string[] = [`Formation Bweb Agence : ${s.title}.`];
  if (isOnline(s.mode) || isHybrid(s.mode)) {
    if (s.meeting_url) lines.push(`Lien de connexion : ${s.meeting_url}`);
    if (s.meeting_info) lines.push(s.meeting_info);
  }
  if (!isOnline(s.mode) && s.address) lines.push(`Adresse : ${s.address}`);
  lines.push(`Détails : ${sessionUrl}`);

  return { title: s.title, start, end, description: lines.join("\n"), location, url: isOnline(s.mode) && s.meeting_url ? s.meeting_url : sessionUrl };
}

// Format calendrier UTC compact : 20260801T060000Z
const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** URL « Ajouter à Google Agenda ». */
export function googleCalendarUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${z(e.start)}/${z(e.end)}`,
    details: e.description,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// Échappement iCalendar (RFC 5545) : \ , ; et sauts de ligne.
const esc = (s: string) => (s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

/* Pliage RFC 5545 : une ligne d'un fichier .ics ne dépasse pas 75 OCTETS, la
   suite étant reprise sur la ligne suivante précédée d'une espace. Les parseurs
   stricts (Outlook en tête) rejettent le fichier entier sinon — et un titre de
   webinaire ou une description avec lien de connexion dépasse vite la limite.
   On compte en octets, pas en caractères : « é » en vaut deux, et couper au
   milieu d'un caractère produirait un fichier illisible. */
function plier(ligne: string): string {
  const enc = new TextEncoder();
  if (enc.encode(ligne).length <= 75) return ligne;
  const morceaux: string[] = [];
  let courante = "";
  let taille = 0;
  for (const ch of ligne) {
    const n = enc.encode(ch).length;
    // Les lignes de continuation commencent par une espace : un octet de moins.
    const max = morceaux.length === 0 ? 75 : 74;
    if (taille + n > max) {
      morceaux.push(courante);
      courante = "";
      taille = 0;
    }
    courante += ch;
    taille += n;
  }
  if (courante) morceaux.push(courante);
  return morceaux.join("\r\n ");
}

/** Contenu d'un fichier .ics (Apple Calendar, Outlook, etc.). */
export function icsFromEvent(e: CalEvent, uid: string): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bweb Agence//Formations//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@bwebagence.com`,
    `DTSTAMP:${z(e.start)}`,
    `DTSTART:${z(e.start)}`,
    `DTEND:${z(e.end)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(e.description)}`,
    `LOCATION:${esc(e.location)}`,
    `URL:${esc(e.url)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc("Rappel : " + e.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].map(plier).join("\r\n");
}
