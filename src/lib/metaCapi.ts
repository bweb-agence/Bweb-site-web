/* =========================================================
   BWEB — API Conversions de Meta (suivi côté serveur)
   -----------------------------------------------------------
   POURQUOI. Le pixel du navigateur ne part qu'avec le consentement, et se fait
   couper par les bloqueurs, Safari et les navigations privées. L'API
   Conversions envoie les mêmes événements depuis NOS serveurs, à partir des
   coordonnées que la personne vient elle-même de saisir : une inscription
   enregistrée en base est un signal certain, là où le pixel est un pari.

   CE QUE ÇA NE FAIT PAS. Ce n'est pas un contournement du consentement. Meta
   exige le même fondement juridique côté serveur ; la différence est technique
   (fiabilité), pas juridique. La décision d'envoyer ou non reste à l'appelant.

   DÉDOUBLONNAGE. Quand un même événement part des deux côtés, Meta les fusionne
   s'ils partagent `event_name` ET `event_id`. D'où un identifiant STABLE et
   dérivé de la donnée (l'identifiant de vente, l'adresse de l'inscrit) plutôt
   qu'un tirage au hasard : deux envois du même fait produisent la même clé.

   HACHAGE. Toute donnée personnelle part en SHA-256, minuscules et sans
   espaces — c'est le contrat de Meta, et ça évite d'envoyer un e-mail en clair
   à un tiers. Les champs non hachés (`client_ip_address`, `client_user_agent`)
   sont facultatifs : on ne les transmet que s'ils sont fournis.

   SILENCIEUX SI NON CONFIGURÉ. Sans jeton, la fonction renvoie `false` sans
   rien tenter : le site tourne exactement comme avant.

   IL FAUT ATTENDRE CETTE PROMESSE. Les appelants ont d'abord lancé la fonction
   sans l'attendre (`void ...`), en la traitant comme une tâche de fond. Sur
   Vercel, c'est un envoi perdu : l'instance serverless est GELÉE dès que la
   réponse HTTP part, et la requête vers Meta, encore en vol, meurt avec elle —
   sans erreur, sans trace. C'est ce qui expliquait des conversions serveur
   vides alors que le jeton était bien en place. Le `signal` ci-dessous borne
   l'attente pour que ce soit sans risque pour le temps de réponse.
   ========================================================= */
import { createHash } from "node:crypto";
import { secret } from "./env";

const VERSION_API = "v21.0";

export type EvenementMeta = {
  /** « Lead », « Purchase », « CompleteRegistration »… */
  nom: string;
  /** Clé de fusion avec l'événement du navigateur. Stable, jamais aléatoire. */
  eventId: string;
  /** Horodatage de l'événement (défaut : maintenant). */
  quand?: Date;
  /** L'URL où le fait s'est produit, telle que vue par le visiteur. */
  url?: string;
  contact?: { email?: string | null; phone?: string | null; prenom?: string | null; nom?: string | null; pays?: string | null };
  /** Montant, devise, nom du produit… */
  donnees?: Record<string, unknown>;
  /** Empreintes techniques du navigateur, quand la route les connaît. */
  ip?: string | null;
  userAgent?: string | null;
};

/** SHA-256 de la valeur normalisée, ou `undefined` si rien d'exploitable. */
function empreinte(valeur?: string | null): string | undefined {
  const propre = (valeur || "").trim().toLowerCase();
  if (!propre) return undefined;
  return createHash("sha256").update(propre).digest("hex");
}

/** Le téléphone se hache SANS le « + » ni les séparateurs (contrat Meta). */
function empreinteTelephone(valeur?: string | null): string | undefined {
  const chiffres = (valeur || "").replace(/\D/g, "");
  return chiffres ? createHash("sha256").update(chiffres).digest("hex") : undefined;
}

const sansVide = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "")) as T;

/** Vrai si le jeton et l'identifiant de pixel sont en place. */
export function capiConfiguree(): boolean {
  return Boolean(secret("META_CAPI_TOKEN") && secret("META_PIXEL_ID"));
}

/**
 * Envoie un événement à Meta. Ne lève jamais : un incident de mesure ne doit
 * pas faire échouer une inscription ou un encaissement.
 */
export async function envoyerEvenementMeta(evenement: EvenementMeta): Promise<boolean> {
  const jeton = secret("META_CAPI_TOKEN");
  const pixel = secret("META_PIXEL_ID");
  if (!jeton || !pixel) return false;

  const contact = evenement.contact || {};
  const user_data = sansVide({
    em: empreinte(contact.email),
    ph: empreinteTelephone(contact.phone),
    fn: empreinte(contact.prenom),
    ln: empreinte(contact.nom),
    country: empreinte(contact.pays),
    client_ip_address: evenement.ip || undefined,
    client_user_agent: evenement.userAgent || undefined,
  });

  /* Sans la moindre donnée d'identité, Meta ne peut rattacher l'événement à
     personne : l'appel serait facturé en quota pour rien. */
  if (!user_data.em && !user_data.ph) return false;

  const corps = {
    data: [
      sansVide({
        event_name: evenement.nom,
        event_time: Math.floor((evenement.quand || new Date()).getTime() / 1000),
        event_id: evenement.eventId,
        event_source_url: evenement.url,
        action_source: "website",
        user_data,
        custom_data: evenement.donnees,
      }),
    ],
    /* Marque nos envois : dans le gestionnaire d'événements, on distingue d'un
       coup d'œil ce qui vient du site de ce qui vient du navigateur. */
    partner_agent: "bweb-site",
  };

  try {
    const reponse = await fetch(
      `https://graph.facebook.com/${VERSION_API}/${pixel}/events?access_token=${encodeURIComponent(jeton)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
        /* Borne dure : l'appelant ATTEND désormais cette promesse, donc une lenteur de Meta se paierait en temps de réponse pour
           le visiteur. Trois secondes suffisent très largement — l'appel tient
           d'ordinaire en moins d'une demi-seconde. */
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!reponse.ok) {
      const detail = await reponse.text().catch(() => "");
      console.error(`[meta-capi] ${evenement.nom} refusé (${reponse.status}) ${detail.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[meta-capi] injoignable —", err instanceof Error ? err.message : err);
    return false;
  }
}
