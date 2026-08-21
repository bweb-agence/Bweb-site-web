export const prerender = false;

/* =========================================================
   BWEB AGENCE — Réception des ventes Chariow (« Pulse »)
   -----------------------------------------------------------
   Les parcours se vendent sur Chariow (widget de paiement, boutique externe).
   Jusqu'ici rien n'en revenait : une fiche contact pouvait afficher trois
   soumissions et aucun achat, alors que la personne avait payé 65 000 F CFA.
   Ce point d'entrée reçoit l'événement `successful.sale` et l'inscrit dans la
   timeline (`contact_events` type `achat`), puis passe le contact en `client`.

   ── Deux règles du contrat Chariow qu'il ne faut PAS improviser ─────────────

   1. LA SIGNATURE PORTE SUR LE CORPS BRUT. `x-chariow-signature` vaut
      `sha256=<hmac hex>` calculé sur les octets reçus, avec le secret propre au
      Pulse (`whsec_…`, distinct de la clé d'API) — et il y a désormais UN
      secret PAR BOUTIQUE, toutes deux pointant sur cette URL. Re-sérialiser le JSON analysé
      ne reproduit PAS ces octets — Chariow échappe les barres obliques
      (`https:\/\/…`) et les caractères non-ASCII (`\uXXXX`). D'où `request.text()`
      d'abord, `JSON.parse` ensuite, jamais `request.json()`.

   2. RÉPONDRE 2xx, MÊME POUR CE QU'ON IGNORE. Une livraison non acquittée est
      retentée 5 fois, puis **le Pulse est désactivé automatiquement** et il faut
      le réarmer à la main dans le tableau de bord. Un événement qui ne nous
      intéresse pas (vente abandonnée, licence…) est donc acquitté par 200, pas
      par une erreur.

   Seule exception : une signature invalide ou absente répond 401 — c'est un
   appel dont on ne peut pas prouver l'origine, et l'URL est publique.

   ── Idempotence ────────────────────────────────────────────────────────────
   La documentation conseille de dédupliquer sur `x-pulse-delivery-id`. C'est le
   bon réflexe quand le traitement a des effets de bord (envoyer un e-mail deux
   fois se voit). Ici l'effet est une ligne de timeline : ce qu'on ne veut pas,
   c'est DEUX achats pour UNE vente — or une même vente peut produire plusieurs
   livraisons (un Pulse par abonnement, plus les rejeux manuels). On déduplique
   donc sur l'identifiant de VENTE, garanti unique par l'index partiel de
   `contact_events.dedupe_key`.
   ========================================================= */
import type { APIRoute } from "astro";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { secret } from "../../../lib/env";
import { envoyerEvenementMeta } from "../../../lib/metaCapi";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/** Retire les champs vides d'un objet de données produit. */
const sansVideMeta = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/** Comparaison à temps constant, tolérante aux longueurs différentes. */
function signatureValide(recue: string, attendue: string): boolean {
  const a = Buffer.from(recue);
  const b = Buffer.from(attendue);
  // timingSafeEqual lève sur des tampons de tailles différentes : on teste avant.
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Montant { value?: number; currency?: string }
interface PulseVente {
  event?: string;
  note?: string; // présent uniquement sur les envois de test du tableau de bord
  sale?: {
    id?: string;
    amount?: Montant;
    status?: string;
    created_at?: string;
    completed_at?: string | null;
    custom_metadata?: Record<string, unknown> | null;
  };
  product?: { id?: string; name?: string; url?: string };
  customer?: {
    id?: string; name?: string; first_name?: string; last_name?: string;
    email?: string; phone?: string; country?: string;
  };
}

export const POST: APIRoute = async ({ request }) => {
  /* PLUSIEURS BOUTIQUES, PLUSIEURS SECRETS. Chaque Pulse a le sien, et les deux
     boutiques (celle de Godwin et celle de l'agence) écrivent sur CETTE URL.
     Avec un seul secret accepté, les livraisons de l'autre boutique tombent en
     401 — et Chariow désactive le Pulse tout seul au bout de 5 échecs, sans que
     personne le remarque avant de voir le chiffre d'affaires figé.
     On essaie donc chaque secret connu et il suffit qu'UN corresponde.

     Le jour où la boutique de Godwin cesse d'alimenter le site, il n'y a qu'à
     supprimer sa variable dans Vercel : rien à changer ici. */
  const secretsConnus = [
    secret("CHARIOW_PULSE_SECRET"),          // boutique.godwinsoola.com (historique)
    secret("CHARIOW_PULSE_SECRET_AGENCE"),   // boutique.bwebagence.com
  ].filter(Boolean);

  if (secretsConnus.length === 0) {
    /* Sans secret, impossible de prouver l'origine : on ne traite rien. Le 503
       finira par désactiver le Pulse côté Chariow (avec e-mail au propriétaire),
       ce qui est le bon signal — mieux vaut un Pulse éteint qu'un point d'entrée
       public qui gobe n'importe quel corps de requête. */
    console.error("[chariow] aucun secret de Pulse configuré — livraison refusée");
    return json({ ok: false, error: "not_configured" }, 503);
  }

  // Corps BRUT, avant toute analyse : c'est lui, et lui seul, qui est signé.
  const brut = await request.text();
  const recue = request.headers.get("x-chariow-signature") || "";
  const reconnue =
    recue.startsWith("sha256=") &&
    secretsConnus.some((cle) =>
      signatureValide(recue, "sha256=" + createHmac("sha256", cle).update(brut).digest("hex")),
    );

  if (!reconnue) {
    console.error(`[chariow] signature invalide — livraison rejetée (${secretsConnus.length} secret(s) essayé(s))`);
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let corps: PulseVente;
  try {
    corps = JSON.parse(brut) as PulseVente;
  } catch {
    // Signé mais illisible : on acquitte pour ne pas déclencher les relances.
    console.error("[chariow] corps signé mais JSON invalide");
    return json({ ok: true, ignore: "bad_json" });
  }

  const evenement = corps.event || request.headers.get("x-pulse-event") || "";

  /* ── Détection des envois de test ────────────────────────────────────────
     La documentation annonce un champ `note` et l'absence de
     `x-pulse-delivery-id`. Constaté en vrai le 16/08/2026 : ce n'est pas
     suffisant — un « Send test pulse » est passé au travers et a créé un
     contact « John Doe / test@example.com » avec un achat de 9 999 USD dans la
     base de production. Il a fallu l'effacer à la main.

     Le signal fiable est dans les identifiants : Chariow préfixe TOUT par
     `test_` (`test_sale_…`, `test_customer_…`, `test_product_…`). On teste donc
     les deux, en commençant par le plus sûr. Une donnée de démonstration n'a
     rien à faire dans la base clients — et si un jour Chariow changeait ses
     préfixes, `note` reste en second rideau. */
  const identifiantsDeTest =
    (corps.sale?.id || "").startsWith("test_") || (corps.customer?.id || "").startsWith("test_");

  if (identifiantsDeTest || (corps.note && !request.headers.get("x-pulse-delivery-id"))) {
    return json({
      ok: true,
      test: true,
      signature: "valide",
      evenement,
      note: "Envoi de test reconnu : signature vérifiée, rien n'a été écrit en base.",
    });
  }

  // Tout le reste (vente abandonnée, licences, affiliés…) est acquitté sans
  // traitement : le Pulse doit rester armé.
  if (evenement !== "successful.sale") {
    return json({ ok: true, ignore: `evenement_non_traite:${evenement}` });
  }

  const vente = corps.sale || {};
  const client = corps.customer || {};
  const produit = corps.product || {};

  if (!vente.id) return json({ ok: true, ignore: "vente_sans_identifiant" });

  const email = (client.email || "").trim().toLowerCase() || null;
  const phone = (client.phone || "").trim() || null;
  if (!email && !phone) {
    // Sans coordonnée, impossible de rattacher l'achat à qui que ce soit.
    console.error(`[chariow] vente ${vente.id} sans e-mail ni téléphone — non rattachée`);
    return json({ ok: true, ignore: "client_sans_coordonnees" });
  }

  try {
    const admin = createAdminClient();

    const nom = client.name?.trim()
      || [client.first_name, client.last_name].filter(Boolean).join(" ").trim()
      || null;

    const { data: contactId, error: errContact } = await admin.rpc("resolve_contact", {
      p_email: email,
      p_phone: phone,
      p_name: nom,
      p_company: null,
      p_source: "chariow",
      p_utm: null,
    });
    if (errContact) throw errContact;
    if (!contactId) return json({ ok: true, ignore: "contact_non_resolu" });

    const montant = Math.round(Number(vente.amount?.value) || 0);
    const devise = (vente.amount?.currency || "XOF").toUpperCase();
    const titre = produit.name ? `${produit.name}` : "Achat Chariow";

    const { error: errEvent } = await admin.from("contact_events").insert({
      contact_id: contactId,
      type: "achat",
      title: titre,
      amount: montant,
      currency: devise,
      source: "chariow",
      occurred_at: vente.completed_at || vente.created_at || new Date().toISOString(),
      dedupe_key: `chariow:sale:${vente.id}`,
      meta: {
        sale_id: vente.id,
        product_id: produit.id ?? null,
        product_url: produit.url ?? null,
        customer_id: client.id ?? null,
        pays: client.country ?? null,
        custom_metadata: vente.custom_metadata ?? null,
      },
    });

    // 23505 = violation d'unicité sur `dedupe_key` : la vente est déjà inscrite
    // (rejeu manuel, ou deuxième Pulse abonné au même événement). Rien à faire.
    if (errEvent && errEvent.code !== "23505") throw errEvent;
    const dejaConnue = errEvent?.code === "23505";

    /* Un achat fait un client, quelle que soit son origine. Écriture
       inconditionnelle : elle est idempotente et coûte une ligne. */
    if (!dejaConnue) {
      await admin.from("contacts").update({ status: "client" }).eq("id", contactId).neq("status", "client");

      /* Meta, côté serveur : l'encaissement est confirmé par Chariow, donc la
         conversion est certaine — le navigateur de l'acheteur, lui, a pu ne
         jamais charger le pixel. Envoyé UNE SEULE FOIS, dans la branche qui
         écarte déjà les rejeux : l'identifiant d'événement porte celui de la
         vente, ce qui laisse à Meta de quoi fusionner si le pixel remonte la
         même. Silencieux tant que le jeton n'est pas configuré.

         ATTENDU, pas lancé en tâche de fond : Vercel gèle l'instance dès la
         réponse émise, et un envoi non attendu mourait en vol sans laisser de
         trace. L'appel est borné à 3 s côté `metaCapi`. */
      await envoyerEvenementMeta({
        nom: "Purchase",
        eventId: `chariow:sale:${vente.id}`,
        quand: vente.completed_at || vente.created_at ? new Date(vente.completed_at || vente.created_at!) : undefined,
        url: produit.url || undefined,
        contact: { email, phone, prenom: client.first_name || nom, pays: client.country },
        donnees: sansVideMeta({ value: montant, currency: devise, content_name: produit.name, content_ids: produit.id ? [produit.id] : undefined }),
      });
    }

    return json({ ok: true, vente: vente.id, contact: contactId, deja_connue: dejaConnue });
  } catch (err) {
    /* Erreur de notre côté : on répond 500 pour que Chariow réessaie — c'est
       exactement le cas où sa politique de relance nous rend service. */
    console.error("[chariow] enregistrement impossible —", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "server" }, 500);
  }
};

/* Un GET sur cette URL n'est jamais normal — et il a une cause presque unique,
   coûteuse, qu'il faut nommer.

   `bwebagence.com` redirige en **301** vers `www.bwebagence.com`. Or un 301
   transforme un POST en GET chez la plupart des clients HTTP. Un Pulse configuré
   sur le domaine nu envoie donc son POST, suit la redirection en GET, et atterrit
   ici. C'est exactement ce qui s'est produit au premier essai.

   La première version de cette sonde répondait `{ok:true}` avec un 200 : Chariow
   enregistrait une livraison RÉUSSIE, et la vente était perdue sans un bruit —
   le pire mode de défaillance possible, une perte de données sous voyant vert.

   D'où un 405, qui apparaît en rouge dans l'onglet Deliveries avec le message
   ci-dessous. Après cinq échecs le Pulse sera désactivé et un e-mail partira :
   bruyant, mais infiniment préférable à des ventes qui disparaissent. */
export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      ok: false,
      error: "methode_incorrecte",
      attendu: "POST",
      cause_probable:
        "Un GET ici provient presque toujours d'un POST redirigé : " +
        "https://bwebagence.com répond 301 vers https://www.bwebagence.com, " +
        "et un 301 change le POST en GET.",
      correction:
        "Configurer le Pulse sur https://www.bwebagence.com/api/webhooks/chariow (avec le www).",
    }),
    { status: 405, headers: { "Content-Type": "application/json", Allow: "POST" } },
  );
