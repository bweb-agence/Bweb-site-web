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
      Pulse (`whsec_…`, distinct de la clé d'API). Re-sérialiser le JSON analysé
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

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

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
  const signingSecret = secret("CHARIOW_PULSE_SECRET");
  if (!signingSecret) {
    /* Sans secret, impossible de prouver l'origine : on ne traite rien. Le 503
       finira par désactiver le Pulse côté Chariow (avec e-mail au propriétaire),
       ce qui est le bon signal — mieux vaut un Pulse éteint qu'un point d'entrée
       public qui gobe n'importe quel corps de requête. */
    console.error("[chariow] CHARIOW_PULSE_SECRET absente — livraison refusée");
    return json({ ok: false, error: "not_configured" }, 503);
  }

  // Corps BRUT, avant toute analyse : c'est lui, et lui seul, qui est signé.
  const brut = await request.text();
  const recue = request.headers.get("x-chariow-signature") || "";
  const attendue = "sha256=" + createHmac("sha256", signingSecret).update(brut).digest("hex");

  if (!recue.startsWith("sha256=") || !signatureValide(recue, attendue)) {
    console.error("[chariow] signature invalide — livraison rejetée");
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

  /* Envoi de test depuis le tableau de bord : signé comme un vrai, mais sans
     identifiant de livraison et avec un champ `note`. On confirme que la
     signature passe, sans rien écrire en base. */
  if (corps.note && !request.headers.get("x-pulse-delivery-id")) {
    return json({ ok: true, test: true, signature: "valide", evenement });
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
    }

    return json({ ok: true, vente: vente.id, contact: contactId, deja_connue: dejaConnue });
  } catch (err) {
    /* Erreur de notre côté : on répond 500 pour que Chariow réessaie — c'est
       exactement le cas où sa politique de relance nous rend service. */
    console.error("[chariow] enregistrement impossible —", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "server" }, 500);
  }
};

/** Une requête GET sur l'URL du Pulse : réponse lisible, sans rien exposer. */
export const GET: APIRoute = () =>
  json({ ok: true, endpoint: "chariow-pulse", methode_attendue: "POST" });
