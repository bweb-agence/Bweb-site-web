/* =========================================================
   BWEB ACADEMY — E-mails du tunnel webinaire
   -----------------------------------------------------------
   Le socle d'envoi : l'événement vient de la table `webinaires` (réglable
   dans le tableau de bord), l'anti-doublon de `webinaire_emails`, l'envoi de
   Bird via sendEmail(). Les rappels (J-1, jour J, H-1, replay) viendront se
   brancher ici : ils partageront `envoyerEmailWebinaire`, qui tient déjà le
   journal et la timeline.

   RÈGLE : rien de ce fichier ne fait échouer une inscription. Toutes les
   fonctions publiques avalent leurs erreurs — au pire l'inscrit n'a pas son
   e-mail, ce qui reste préférable à un formulaire qui casse.

   ORDRE DE L'ANTI-DOUBLON : on inscrit le journal AVANT d'envoyer, puis on
   efface la ligne si Bird refuse. L'inverse (envoyer puis journaliser) laisse
   une fenêtre pendant laquelle deux appels simultanés — un double-clic sur le
   formulaire, un cron relancé à la main pendant que le premier tourne — passent
   tous les deux le test et envoient deux fois. Un e-mail perdu se renvoie ;
   un doublon, non.
   ========================================================= */
import { createAdminClient } from "./supabaseAdmin";
import { sendEmail, webinaireConfirmationEmail } from "./email";
import { googleCalendarUrl, icsFromEvent, type CalEvent } from "./calendar";

const SITE = "https://www.bwebagence.com";

/** Le tunnel actuel. Aussi la `form_key` de ses soumissions. */
export const WEBINAIRE_SLUG = "webinaire-initiation";

/** Types d'e-mails du tunnel. Le journal en garde un par inscrit et par envoi. */
export type KindWebinaire = "confirmation" | "reminder_1d" | "reminder_0d" | "reminder_1h" | "replay";

export interface Webinaire {
  id: string;
  slug: string;
  title: string;
  starts_at: string;
  duration_min: number;
  join_url: string | null;
  join_info: string | null;
  replay_url: string | null;
}

const CHAMPS = "id, slug, title, starts_at, duration_min, join_url, join_info, replay_url";

/** Le webinaire actif portant ce slug, ou null (base injoignable comprise). */
export async function getWebinaire(admin: any, slug = WEBINAIRE_SLUG): Promise<Webinaire | null> {
  const { data, error } = await admin
    .from("webinaires")
    .select(CHAMPS)
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("[webinaire] lecture impossible —", error.message);
    return null;
  }
  return (data as Webinaire) || null;
}

/* Le live est annoncé à l'heure d'Abidjan partout (landing, page de
   remerciement, publicité). On fixe le fuseau explicitement : le rendu ne doit
   pas dépendre de la région où tourne la fonction serverless. */
const TZ = "Africa/Abidjan";

/** « dimanche 6 septembre 2026 à 20 h » */
export function libelleDate(iso: string): string {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ,
  });
  const heure = d
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
    .replace(":", " h ")
    .replace(/ h 00$/, " h");
  return `${jour} à ${heure}`;
}

/** L'évènement calendrier correspondant (Google Agenda + .ics). */
export function evenementWebinaire(w: Webinaire): CalEvent {
  const start = new Date(w.starts_at);
  const end = new Date(start.getTime() + w.duration_min * 60_000);
  const landing = `${SITE}/webinaire-initiation`;
  const lignes = [`Live gratuit avec Godwin Soola (Bweb Academy) : ${w.title}.`];
  if (w.join_url) lignes.push(`Lien de connexion : ${w.join_url}`);
  else lignes.push("Le lien de connexion est envoyé par e-mail avant le live.");
  if (w.join_info) lignes.push(w.join_info);
  lignes.push(landing);
  return {
    title: w.title,
    start,
    end,
    description: lignes.join("\n"),
    location: w.join_url || "En ligne",
    url: w.join_url || landing,
  };
}

/* Bird répond en 600 ms en temps normal, mais l'inscription attend cette
   réponse : au-delà de 8 s, on rend la main au visiteur (il sera redirigé vers
   la page de remerciement) plutôt que de le laisser devant un formulaire qui
   tourne. L'e-mail non parti sera rattrapé par le rappel suivant. */
function avecDelaiMax<T>(p: Promise<T>, ms: number, repli: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(repli), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch(() => { clearTimeout(t); resolve(repli); });
  });
}

export type ResultatEnvoi = "envoye" | "deja_envoye" | "echec" | "webinaire_inconnu";

interface EnvoiInput {
  webinaire: Webinaire;
  kind: KindWebinaire;
  email: string;
  prenom: string;
  contactId?: string | null;
  /** Le message à envoyer, déjà composé. */
  message: { subject: string; html: string; text?: string };
  /** Joindre le fichier .ics (confirmation et rappels de date). */
  agenda?: boolean;
}

/**
 * Envoie UN e-mail du tunnel en tenant le journal. Partagé par la confirmation
 * et, plus tard, par les rappels. Ne lève jamais.
 */
export async function envoyerEmailWebinaire(admin: any, input: EnvoiInput): Promise<ResultatEnvoi> {
  const { webinaire, kind, email, prenom, contactId, message } = input;
  const adresse = email.trim().toLowerCase();
  if (!adresse) return "echec";

  // 1. Réservation de l'envoi (l'unicité de la table fait l'arbitrage).
  const { error: errJournal } = await admin.from("webinaire_emails").insert({
    webinaire_id: webinaire.id,
    contact_id: contactId || null,
    email: adresse,
    kind,
  });
  if (errJournal) {
    if (errJournal.code === "23505") return "deja_envoye";
    console.error(`[webinaire] journal ${kind} impossible —`, errJournal.message);
    return "echec";
  }

  // 2. Envoi.
  let attachments;
  if (input.agenda) {
    const ics = icsFromEvent(evenementWebinaire(webinaire), `webinaire-${webinaire.slug}`);
    attachments = [{
      filename: `live-bweb-${webinaire.slug}.ics`,
      content: Buffer.from(ics, "utf-8").toString("base64"),
      content_type: "text/calendar; charset=utf-8; method=PUBLISH",
    }];
  }

  const ok = await avecDelaiMax(
    sendEmail({ to: adresse, subject: message.subject, html: message.html, text: message.text, attachments }),
    8_000,
    false,
  );

  // 3. Bird a refusé (ou n'a pas répondu à temps) : on rend sa place à l'envoi,
  //    sinon la personne ne recevrait jamais rien et le journal mentirait.
  if (!ok) {
    await admin.from("webinaire_emails")
      .delete()
      .eq("webinaire_id", webinaire.id)
      .eq("kind", kind)
      .ilike("email", adresse);
    return "echec";
  }

  // 4. Timeline du contact. Best-effort : un e-mail parti sans sa trace reste
  //    un e-mail parti.
  if (contactId) {
    const { error: errEvent } = await admin.from("contact_events").insert({
      contact_id: contactId,
      type: "email_envoye",
      title: message.subject,
      source: "webinaire",
      occurred_at: new Date().toISOString(),
      dedupe_key: `webinaire:${webinaire.slug}:${kind}:${adresse}`,
      meta: { webinaire: webinaire.slug, kind, prenom },
    });
    if (errEvent && errEvent.code !== "23505") {
      console.error("[webinaire] événement non enregistré —", errEvent.message);
    }
  }

  return "envoye";
}

/**
 * Confirmation d'inscription, envoyée dans la foulée du formulaire.
 * Ne lève jamais : appelée depuis la route d'inscription.
 */
export async function envoyerConfirmationWebinaire(opts: {
  email: string;
  prenom: string;
  contactId?: string | null;
  slug?: string;
}): Promise<ResultatEnvoi> {
  try {
    const admin = createAdminClient();
    const webinaire = await getWebinaire(admin, opts.slug || WEBINAIRE_SLUG);
    if (!webinaire) return "webinaire_inconnu";

    const evenement = evenementWebinaire(webinaire);
    const message = webinaireConfirmationEmail({
      prenom: opts.prenom,
      title: webinaire.title,
      date_label: libelleDate(webinaire.starts_at),
      duration_min: webinaire.duration_min,
      join_url: webinaire.join_url,
      join_info: webinaire.join_info,
      calendarGoogle: googleCalendarUrl(evenement),
      calendarIcs: `${SITE}/api/calendrier?w=${webinaire.slug}`,
    });

    return await envoyerEmailWebinaire(admin, {
      webinaire,
      kind: "confirmation",
      email: opts.email,
      prenom: opts.prenom,
      contactId: opts.contactId,
      message,
      agenda: true,
    });
  } catch (err) {
    console.error("[webinaire] confirmation non envoyée —", err instanceof Error ? err.message : err);
    return "echec";
  }
}
