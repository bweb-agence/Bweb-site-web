/* =========================================================
   BWEB — Google Analytics 4, côté serveur (API Data v1beta)
   -----------------------------------------------------------
   POURQUOI. L'entonnoir du webinaire commence par une VISITE, et les visites
   ne sont nulle part dans notre base : elles vivent dans GA4. Sans ce module,
   l'écran d'analyse démarre à l'inscription et ne peut rien dire du taux qui
   décide du coût d'acquisition — combien de visiteurs s'inscrivent.

   AUTHENTIFICATION SANS DÉPENDANCE. Google accepte un jeton d'accès obtenu
   contre un JWT signé par le compte de service (« two-legged OAuth »). C'est
   une trentaine de lignes avec `node:crypto`, contre une bibliothèque
   supplémentaire dans le paquet serverless pour le même résultat. Le JWT est
   signé RS256, vaut une heure, et n'est demandé qu'à l'expiration du
   précédent — un appel de jeton par heure et par instance, pas par requête.

   SILENCIEUX SI NON CONFIGURÉ. Sans les trois variables, les fonctions
   renvoient `null` et l'écran affiche « en attente de connexion ». Le site
   tourne exactement comme avant.

   CE QU'IL FAUT DANS VERCEL :
     GA4_PROPERTY_ID   identifiant NUMÉRIQUE de la propriété (pas le « G-… »)
     GA_SA_EMAIL       …@….iam.gserviceaccount.com
     GA_SA_PRIVATE_KEY la clé privée du compte de service, avec ses en-têtes
                       BEGIN/END. Les retours à la ligne peuvent être écrits
                       « \n » : ils sont rétablis ici, parce qu'une interface
                       web les aplatit presque toujours au collage.
   ========================================================= */
import { createSign } from "node:crypto";
import { secret } from "./env";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DATA_URL = "https://analyticsdata.googleapis.com/v1beta";
const PORTEE = "https://www.googleapis.com/auth/analytics.readonly";

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Vrai si les trois variables sont en place. */
export function ga4Configure(): boolean {
  return Boolean(secret("GA4_PROPERTY_ID") && secret("GA_SA_EMAIL") && secret("GA_SA_PRIVATE_KEY"));
}

/* Le jeton vaut une heure ; on le garde en mémoire d'instance et on le
   renouvelle une minute avant l'échéance, pour ne jamais présenter un jeton
   expiré à cause d'une requête partie juste avant la limite. */
let jetonCache: { valeur: string; expire: number } | null = null;

async function jeton(): Promise<string | null> {
  if (jetonCache && Date.now() < jetonCache.expire) return jetonCache.valeur;

  const email = secret("GA_SA_EMAIL");
  const cle = secret("GA_SA_PRIVATE_KEY").replace(/\\n/g, "\n");
  if (!email || !cle) return null;

  const maintenant = Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corps = b64url(JSON.stringify({
    iss: email, scope: PORTEE, aud: TOKEN_URL, iat: maintenant, exp: maintenant + 3600,
  }));

  let signature: string;
  try {
    const s = createSign("RSA-SHA256");
    s.update(`${entete}.${corps}`);
    signature = b64url(s.sign(cle));
  } catch (err) {
    // Clé mal collée (en-têtes manquants, retours à la ligne perdus) : c'est
    // l'erreur la plus fréquente, autant la nommer.
    console.error("[ga4] signature impossible — vérifier GA_SA_PRIVATE_KEY —", err instanceof Error ? err.message : err);
    return null;
  }

  try {
    const rep = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${entete}.${corps}.${signature}`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const d = await rep.json().catch(() => ({}));
    if (!rep.ok || !d.access_token) {
      console.error(`[ga4] jeton refusé (${rep.status})`, JSON.stringify(d).slice(0, 200));
      return null;
    }
    jetonCache = { valeur: d.access_token, expire: Date.now() + (d.expires_in - 60) * 1000 };
    return d.access_token;
  } catch (err) {
    console.error("[ga4] service de jeton injoignable —", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Sessions par chemin de page, sur une période.
 *
 * `sessions` et non `screenPageViews` : l'entonnoir compte des PERSONNES
 * arrivées sur la page, pas des affichages. Un visiteur qui recharge la page
 * trois fois reste une visite face à une inscription.
 *
 * Les chemins sont normalisés sans barre oblique finale : GA4 distingue
 * « /webinaire-initiation » de « /webinaire-initiation/ », qui sont la même
 * page pour nous (le site redirige l'une vers l'autre).
 *
 * Renvoie `null` si GA4 n'est pas configuré ou injoignable — jamais une
 * exception : une panne de mesure ne doit pas casser l'écran d'admin.
 */
export async function sessionsParChemin(
  chemins: string[],
  depuis: string,
  jusqua = "today",
): Promise<Record<string, number> | null> {
  const propriete = secret("GA4_PROPERTY_ID");
  const acces = await jeton();
  if (!propriete || !acces) return null;

  try {
    const rep = await fetch(`${DATA_URL}/properties/${propriete}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${acces}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: depuis, endDate: jusqua }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          orGroup: {
            expressions: chemins.map((c) => ({
              filter: { fieldName: "pagePath", stringFilter: { matchType: "EXACT", value: c } },
            })).concat(chemins.map((c) => ({
              filter: { fieldName: "pagePath", stringFilter: { matchType: "EXACT", value: c + "/" } },
            }))),
          },
        },
        limit: 100,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const d = await rep.json().catch(() => ({}));
    if (!rep.ok) {
      console.error(`[ga4] rapport refusé (${rep.status})`, JSON.stringify(d?.error?.message || d).slice(0, 200));
      return null;
    }
    const total: Record<string, number> = Object.fromEntries(chemins.map((c) => [c, 0]));
    for (const ligne of d.rows || []) {
      const chemin = (ligne.dimensionValues?.[0]?.value || "").replace(/\/$/, "") || "/";
      const n = Number(ligne.metricValues?.[0]?.value || 0);
      if (chemin in total) total[chemin] += n;
    }
    return total;
  } catch (err) {
    console.error("[ga4] rapport injoignable —", err instanceof Error ? err.message : err);
    return null;
  }
}
