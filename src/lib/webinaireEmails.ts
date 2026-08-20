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
import { sendEmail, expediteur, webinaireEmail, type WebinaireEmailData } from "./email";
import { contact } from "../config/site";
import { googleCalendarUrl, icsFromEvent, type CalEvent } from "./calendar";

const SITE = "https://www.bwebagence.com";

/** Le tunnel actuel. Aussi la `form_key` de ses soumissions. */
export const WEBINAIRE_SLUG = "webinaire-initiation";

/* Le webinaire est animé par une personne, et ses e-mails tutoient et signent
   « Godwin ». L'expéditeur suit : c'est le nom lu dans la liste des messages,
   avant même l'ouverture. La billetterie, elle, continue d'écrire au nom de
   l'agence — son ton est celui d'une entreprise, son expéditeur aussi. */
const EXPEDITEUR_WEBINAIRE = "Godwin Soola de Bweb Agence";

/** Types d'e-mails du tunnel. Le journal en garde un par inscrit et par envoi. */
export type KindWebinaire = "confirmation" | "reminder_1d" | "reminder_0d" | "reminder_1h" | "live" | "replay";

export interface Webinaire {
  id: string;
  /** Identité stable de l'entonnoir, partagée par toutes les éditions. */
  tunnel: string;
  /** Propre à l'édition : « webinaire-initiation-2026-09 ». */
  slug: string;
  title: string;
  starts_at: string;
  duration_min: number;
  places: number;
  /** Borne d'appartenance : les inscrits d'avant sont ceux de l'édition passée. */
  inscrits_depuis: string | null;
  join_url: string | null;
  join_info: string | null;
  replay_url: string | null;
}

const CHAMPS = "id, tunnel, slug, title, starts_at, duration_min, places, inscrits_depuis, join_url, join_info, replay_url";

/* Le live est mensuel : plusieurs éditions coexistent en base. « L'édition en
   cours » est la prochaine à venir — et, dans les trois jours qui suivent un
   live, celle qui vient d'avoir lieu, puisque sa fenêtre de replay court
   encore. Même règle que la fonction SQL `webinaire_public`, pour que la page
   publique et les e-mails ne parlent jamais de deux éditions différentes. */
const FENETRE_REPLAY_MS = 72 * 3_600_000;

export function editionCourante(editions: Webinaire[], maintenant = new Date()): Webinaire | null {
  if (!editions.length) return null;
  const seuil = maintenant.getTime() - FENETRE_REPLAY_MS;
  const encoreVivantes = editions
    .filter((w) => new Date(w.starts_at).getTime() >= seuil)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  if (encoreVivantes.length) return encoreVivantes[0];
  return [...editions].sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at))[0];
}

/** L'édition en cours de cet entonnoir, ou null (base injoignable comprise). */
export async function getWebinaire(admin: any, tunnel = WEBINAIRE_SLUG): Promise<Webinaire | null> {
  const { data, error } = await admin
    .from("webinaires")
    .select(CHAMPS)
    .or(`tunnel.eq.${tunnel},slug.eq.${tunnel}`)
    .eq("active", true);
  if (error) {
    console.error("[webinaire] lecture impossible —", error.message);
    return null;
  }
  return editionCourante((data || []) as Webinaire[]);
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

/** « 19 h » — l'heure seule, pour les phrases courtes. */
export function libelleHeure(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
    .replace(":", " h ")
    .replace(/ h 00$/, " h");
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
    sendEmail({
      to: adresse,
      from: expediteur(EXPEDITEUR_WEBINAIRE),
      /* Sans le suivi des clics, les liens partent intacts vers bwebagence.com au
         lieu d'être réécrits vers le domaine de redirection : c'est l'un des
         signaux qui poussent un message vers l'onglet Promotions, et ici le lien
         du live doit inspirer confiance au premier coup d'œil. Les ouvertures,
         elles, restent mesurées. */
      trackClicks: false,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments,
    }),
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

/** Les données de gabarit pour un inscrit donné. */
function donneesGabarit(w: Webinaire, prenom: string, unsubToken?: string | null): WebinaireEmailData {
  const evenement = evenementWebinaire(w);
  return {
    prenom,
    title: w.title,
    date_label: libelleDate(w.starts_at),
    heure_label: libelleHeure(w.starts_at),
    duration_min: w.duration_min,
    join_url: w.join_url,
    join_info: w.join_info,
    replay_url: w.replay_url,
    calendarGoogle: googleCalendarUrl(evenement),
    calendarIcs: `${SITE}/api/calendrier?w=${w.slug}`,
    landing: `${SITE}/webinaire-initiation`,
    whatsapp: `https://wa.me/${contact.whatsapp.primary}?text=${encodeURIComponent("PLACE")}`,
    unsubUrl: unsubToken ? `${SITE}/desabonnement?t=${unsubToken}` : null,
  };
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

    /* Pas de lien de désabonnement sur la confirmation : elle répond à un acte
       volontaire fait il y a dix secondes. Les rappels, eux, en portent un. */
    const message = webinaireEmail("confirmation", donneesGabarit(webinaire, opts.prenom));
    if (!message) return "echec";

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

/* =========================================================
   LA SÉQUENCE — quels e-mails sont dus, maintenant
   ---------------------------------------------------------
   Le calendrier se lit en HEURES avant le live, pas en jours : le rappel d'une
   heure avant et celui du démarrage n'existent pas à l'échelle de la journée.
   Chaque fenêtre est large (le passage du cron n'est jamais à la seconde) et
   l'unicité du journal fait le reste — un cron qui repasse dans la même fenêtre
   ne renvoie rien.

   Une fenêtre PASSÉE ne rattrape rien : quelqu'un qui s'inscrit à 18 h 30 reçoit
   sa confirmation puis le message d'ouverture, jamais « c'est demain ».
   ========================================================= */
const FENETRES: { kind: KindWebinaire; min: number; max: number }[] = [
  // (heures avant le début ; négatif = après)
  /* La bascule veille / jour J est à 18 h, pas à 24 h : un appel du cron le soir
     de la veille (23 h avant) tomberait sinon dans « c'est ce soir », qui serait
     faux d'une journée. À 18-24 h du live on répète donc « c'est demain » — et
     comme il est déjà parti le matin, le journal en fait un non-événement. */
  { kind: "reminder_1d", min: 18, max: 48 },   // le matin de la veille
  { kind: "reminder_0d", min: 6, max: 18 },    // le matin du jour J
  { kind: "reminder_1h", min: 0.25, max: 2 },  // une heure avant
  { kind: "live", min: -0.5, max: 0.25 },      // à l'ouverture des portes
  { kind: "replay", min: -72, max: -6 },       // le lendemain matin et les jours suivants
];

/** Les types d'e-mails dus pour ce webinaire à cet instant. */
export function kindsDus(startsAt: string, maintenant = new Date()): KindWebinaire[] {
  const heures = (new Date(startsAt).getTime() - maintenant.getTime()) / 3_600_000;
  return FENETRES.filter((f) => heures > f.min && heures <= f.max).map((f) => f.kind);
}

/* Bird tient ~600 ms par message : 500 inscrits en file d'attente séquentielle
   dépasseraient largement le plafond de 60 s de la fonction. On envoie par
   vagues, et on s'arrête AVANT la coupure — le reste part au passage suivant
   (le journal garantit qu'on ne renvoie rien de déjà envoyé). */
const CONCURRENCE = 6;
const BUDGET_MS = 45_000;

interface Inscrit {
  email: string;
  prenom: string;
  contactId: string | null;
  unsubToken: string | null;
}

/** Les inscrits joignables d'une ÉDITION : dédoublonnés, désabonnés exclus. */
async function inscrits(admin: any, w: Webinaire): Promise<Inscrit[]> {
  /* `inscrits_depuis` sépare les éditions. Sans elle, les inscrits de
     septembre recevraient les rappels d'octobre alors qu'ils ont déjà vu le
     live — et la première édition, qui n'a pas de borne, prend tout le monde. */
  let requete = admin
    .from("form_submissions")
    .select("email, full_name, contact_id, contacts(email_opt_in, unsubscribed_at, unsubscribe_token)")
    .eq("form_key", w.tunnel)
    .not("email", "is", null);
  if (w.inscrits_depuis) requete = requete.gte("submitted_at", w.inscrits_depuis);
  const { data, error } = await requete.order("submitted_at", { ascending: true });
  if (error) {
    console.error("[webinaire] liste des inscrits illisible —", error.message);
    return [];
  }

  const parAdresse = new Map<string, Inscrit>();
  for (const row of (data || []) as any[]) {
    const adresse = String(row.email || "").trim().toLowerCase();
    if (!adresse) continue;
    const c = row.contacts;
    /* L'opt-out est vérifié À L'ENVOI, pas à l'inscription : quelqu'un qui s'est
       désabonné entre-temps ne doit plus rien recevoir, même s'il s'était
       inscrit avant. Autorité serveur, comme pour les campagnes. */
    if (c && (c.email_opt_in === false || c.unsubscribed_at)) continue;
    // La première soumission gagne : c'est celle qui porte le prénom d'origine.
    if (!parAdresse.has(adresse)) {
      parAdresse.set(adresse, {
        email: adresse,
        prenom: String(row.full_name || "").trim() || "toi",
        contactId: row.contact_id || null,
        unsubToken: c?.unsubscribe_token || null,
      });
    }
  }
  return [...parAdresse.values()];
}

export interface RapportSequence {
  webinaire?: string;
  kinds: KindWebinaire[];
  inscrits: number;
  envoyes: number;
  deja: number;
  echecs: number;
  ignores: number;
  reste: number;
  budget_atteint?: boolean;
}

/**
 * Envoie tout ce qui est dû, pour tous les webinaires actifs.
 * Appelée par le cron de 6 h (rappels du matin) et par le cron externe du VPS
 * (une heure avant, puis à l'ouverture). Ne lève jamais.
 */
export async function envoyerSequenceWebinaire(admin: any, maintenant = new Date()): Promise<RapportSequence> {
  const rapport: RapportSequence = { kinds: [], inscrits: 0, envoyes: 0, deja: 0, echecs: 0, ignores: 0, reste: 0 };
  const debut = Date.now();

  const { data: webinaires, error } = await admin
    .from("webinaires")
    .select(CHAMPS)
    .eq("active", true);
  if (error) {
    console.error("[webinaire] webinaires illisibles —", error.message);
    return rapport;
  }

  for (const w of (webinaires || []) as Webinaire[]) {
    const kinds = kindsDus(w.starts_at, maintenant);
    if (!kinds.length) continue;
    rapport.webinaire = w.slug;
    rapport.kinds.push(...kinds);

    const liste = await inscrits(admin, w);
    rapport.inscrits += liste.length;

    for (const kind of kinds) {
      /* Filtre préalable : on lit le journal une fois plutôt que de tenter
         500 insertions vouées à l'échec. L'insertion reste l'arbitre — c'est
         elle qui protège des envois simultanés. */
      const { data: dejaEnvoyes } = await admin
        .from("webinaire_emails")
        .select("email")
        .eq("webinaire_id", w.id)
        .eq("kind", kind);
      const connus = new Set(((dejaEnvoyes || []) as any[]).map((r) => String(r.email).toLowerCase()));
      const aFaire = liste.filter((i) => !connus.has(i.email));
      rapport.deja += liste.length - aFaire.length;

      let curseur = 0;
      while (curseur < aFaire.length) {
        if (Date.now() - debut > BUDGET_MS) {
          rapport.budget_atteint = true;
          rapport.reste += aFaire.length - curseur;
          break;
        }
        const vague = aFaire.slice(curseur, curseur + CONCURRENCE);
        await Promise.all(vague.map(async (inscrit) => {
          const message = webinaireEmail(kind, donneesGabarit(w, inscrit.prenom, inscrit.unsubToken));
          /* Message impossible à composer = lien du live absent. On ne journalise
             rien : dès que le lien sera renseigné, le passage suivant enverra. */
          if (!message) { rapport.ignores++; return; }
          const r = await envoyerEmailWebinaire(admin, {
            webinaire: w,
            kind,
            email: inscrit.email,
            prenom: inscrit.prenom,
            contactId: inscrit.contactId,
            message,
            agenda: kind === "confirmation" || kind === "reminder_1d",
          });
          if (r === "envoye") rapport.envoyes++;
          else if (r === "deja_envoye") rapport.deja++;
          else rapport.echecs++;
        }));
        curseur += vague.length;
      }
      if (rapport.budget_atteint) break;
    }
    if (rapport.budget_atteint) break;
  }

  if (rapport.ignores) {
    console.error(`[webinaire] ${rapport.ignores} message(s) non composés — lien du live absent en base`);
  }
  return rapport;
}
