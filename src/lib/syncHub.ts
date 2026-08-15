/* =========================================================
   BWEB AGENCE — Mise à niveau quotidienne des bases avec ACQ Hub
   -----------------------------------------------------------
   Le site est la source de vérité de ce qui est soumis CHEZ LUI ; ACQ Hub reste
   l'outil d'acquisition (séquences, pipeline, inbox). Pour que les deux bases
   restent au même niveau, une passe quotidienne pousse vers l'Edge Function
   `ingest` les contacts nouveaux ou modifiés depuis leur dernière transmission.

   Pourquoi une passe groupée plutôt qu'un envoi à chaque soumission :
   - le formulaire ne dépend plus de la disponibilité d'un service tiers ;
   - une panne d'ACQ Hub n'a plus aucune conséquence visible — la passe suivante
     rattrape, il n'y a rien à « rejouer » à la main ;
   - l'admin du site n'a plus à afficher d'état de relais : `hub_synced_at`
     suffit, et il ne concerne que la technique.

   Idempotence : la clé est stable par contact (`site:contact:<id>`), donc une
   passe rejouée — ou un lead déjà transmis en direct par le tunnel webinaire —
   ne crée pas de doublon côté Hub.

   Ne lève jamais : appelée par un cron, elle rend un compte-rendu chiffré.
   ========================================================= */
import type { SupabaseClient } from "@supabase/supabase-js";
import { secret } from "./env";

/* ---------- Cadence d'une passe ----------
   Mesuré en production le 15/08/2026 : ~2 s par contact (aller-retour vers
   l'Edge Function + écriture de l'horodatage). En séquentiel, 1 000 contacts
   demanderaient plus de 30 minutes — impossible dans une fonction serverless.

   Deux garde-fous, complémentaires :
   - CONCURRENCE : plusieurs envois en vol. C'est le seul levier qui change
     vraiment le débit (~4 contacts/s à 8 en parallèle).
   - BUDGET : on s'arrête AVANT que la plateforme ne coupe. Une passe tronquée
     par le délai serverless perd son compte-rendu, et on ne sait plus où on en
     est ; une passe qui s'arrête d'elle-même rend un état exact et le reste à
     faire. La reprise est gratuite : `hub_synced_at` est posé contact par
     contact, donc la passe suivante repart exactement où celle-ci s'arrête.

   Le budget doit rester SOUS le `maxDuration` de la fonction (60 s, réglé dans
   astro.config.mjs) : 50 s laissent de quoi rendre la réponse. */
const CONCURRENCE = 8;
const BUDGET_MS_DEFAUT = 50_000;

/** Borne haute de lecture. Au-delà, c'est la passe suivante qui prend le relais. */
const BATCH = 400;

export interface HubSyncReport {
  /** Contacts éligibles traités pendant la passe. */
  traites: number;
  transmis: number;
  echecs: number;
  /** Éligibles lus mais NON traités faute de temps, dans cette passe. */
  reste: number;
  /**
   * Contacts encore jamais transmis APRÈS la passe, toutes fenêtres confondues.
   * C'est le chiffre qui répond à « faut-il relancer ? » : `reste` ne voit que
   * les BATCH contacts lus, et sous-estimerait un arriéré de plusieurs milliers.
   */
  jamais_transmis?: number;
  /** Vrai si la passe s'est arrêtée sur le budget plutôt que faute de travail. */
  budget_atteint?: boolean;
  /** Durée réelle de la passe, en secondes (utile pour régler la cadence). */
  duree_s?: number;
  /** Raison d'une passe sans effet (configuration absente, rien à envoyer). */
  ignore?: string;
}

interface ContactRow {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  company: string | null;
  status: string;
  first_source: string | null;
  first_utm: Record<string, string> | null;
  tags: string[] | null;
  email_opt_in: boolean;
  whatsapp_opt_in: boolean;
  unsubscribed_at: string | null;
  first_seen_at: string;
  updated_at: string;
}

/**
 * Pousse vers ACQ Hub les contacts jamais transmis ou modifiés depuis la
 * dernière transmission. À appeler une fois par jour.
 */
export async function syncContactsToHub(admin: SupabaseClient): Promise<HubSyncReport> {
  const report: HubSyncReport = { traites: 0, transmis: 0, echecs: 0, reste: 0 };

  /* AUCUN repli sur la clé d'un autre tunnel. Côté ACQ Hub, `ingest` retrouve le
     tunnel PAR le hash de la clé, puis exige que le champ `tunnel` du corps
     corresponde à son slug — sinon `tunnel_mismatch`, rejet 400 et mise en file
     d'erreurs. Emprunter la clé du tunnel webinaire enverrait donc chaque
     contact, chaque jour, directement à la DLQ. Mieux vaut ne rien synchroniser
     que polluer le Hub en silence. */
  const ingestUrl = secret("INGEST_URL");
  const ingestKey = secret("TUNNEL_KEY_SITE");
  const tunnel = secret("HUB_TUNNEL_SITE") || "site-bwebagence";

  if (!ingestUrl || !ingestKey) {
    // Non configuré : ce n'est pas une erreur, la synchro est optionnelle.
    report.ignore = "INGEST_URL ou TUNNEL_KEY_SITE absente";
    return report;
  }

  /* Éligibles : jamais transmis, ou modifiés depuis. La comparaison colonne à
     colonne n'est pas exprimable en filtre PostgREST, donc on remonte les
     candidats (jamais transmis + transmis un jour) et on tranche en mémoire —
     le volume reste petit et borné par BATCH. */
  const { data, error } = await admin
    .from("contacts")
    .select(
      "id,email,phone,full_name,company,status,first_source,first_utm,tags," +
        "email_opt_in,whatsapp_opt_in,unsubscribed_at,first_seen_at,updated_at,hub_synced_at",
    )
    .order("hub_synced_at", { ascending: true, nullsFirst: true })
    .order("updated_at", { ascending: true })
    .limit(BATCH);
  if (error) throw error;

  const candidats = (data || []).filter(
    (c: ContactRow & { hub_synced_at: string | null }) =>
      !c.hub_synced_at || new Date(c.updated_at) > new Date(c.hub_synced_at),
  );
  if (!candidats.length) {
    report.ignore = "rien à transmettre";
    return report;
  }

  /** Transmet UN contact. Ne lève pas : renseigne le compte-rendu et rend la main. */
  const transmettre = async (contact: ContactRow): Promise<void> => {
    report.traites++;
    try {
      const res = await fetch(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tunnel-key": ingestKey },
        body: JSON.stringify({
          v: 1,
          idempotency_key: `site:contact:${contact.id}`,
          tunnel,
          step: "synchronisation",
          /* `type` est un ENUM fermé côté Hub : lead_captured, page_viewed,
             video_watched, whatsapp_joined, purchase, status_change, note,
             custom. Une valeur hors liste est rejetée (400) et part en file
             d'erreurs. « custom » est le seul honnête ici : ce n'est pas une
             capture de lead — l'annoncer comme telle déclencherait les
             automatisations d'entrée du Hub sur des contacts déjà connus. La
             nature réelle de l'événement voyage dans le payload. */
          type: "custom",
          occurred_at: new Date().toISOString(),
          contact: {
            phone: contact.phone || undefined,
            email: contact.email || undefined,
            first_name: (contact.full_name || "").trim().split(/\s+/)[0] || undefined,
            last_name: (contact.full_name || "").trim().split(/\s+/).slice(1).join(" ") || undefined,
          },
          payload: {
            evenement: "contact_synced",
            source: "site-bwebagence",
            origine: contact.first_source,
            utm: contact.first_utm || {},
            statut: contact.status,
            societe: contact.company,
            etiquettes: contact.tags || [],
            // Le consentement voyage avec le contact : une personne désabonnée
            // ici ne doit pas être relancée depuis l'autre base.
            email_opt_in: contact.email_opt_in,
            whatsapp_opt_in: contact.whatsapp_opt_in,
            desabonne_le: contact.unsubscribed_at,
            connu_depuis: contact.first_seen_at,
          },
        }),
      });

      if (!res.ok) {
        report.echecs++;
        const detail = await res.text().catch(() => "");
        console.error(`[syncHub] contact ${contact.id} refusé (${res.status}) ${detail.slice(0, 160)}`);
        return; // pas d'horodatage : la passe suivante réessaiera
      }

      // Horodaté seulement après un succès — sinon un échec serait oublié.
      await admin.from("contacts").update({ hub_synced_at: new Date().toISOString() }).eq("id", contact.id);
      report.transmis++;
    } catch (err) {
      report.echecs++;
      console.error(`[syncHub] contact ${contact.id} injoignable —`, err instanceof Error ? err.message : err);
    }
  };

  /* Vagues parallèles, sous surveillance du budget.
     On vérifie l'échéance ENTRE deux vagues, jamais au milieu : couper une vague
     en cours laisserait des requêtes en vol dont on ne saurait pas si le Hub les
     a reçues — donc des contacts potentiellement transmis mais non horodatés,
     qui repartiraient à la passe suivante (sans dommage grâce à l'idempotence,
     mais pour rien). */
  const debut = Date.now();
  const budgetMs = Number(secret("HUB_SYNC_BUDGET_MS")) || BUDGET_MS_DEFAUT;
  const liste = candidats as ContactRow[];
  let curseur = 0;

  while (curseur < liste.length) {
    if (Date.now() - debut > budgetMs) {
      report.budget_atteint = true;
      break;
    }
    const vague = liste.slice(curseur, curseur + CONCURRENCE);
    await Promise.all(vague.map(transmettre));
    curseur += vague.length;
  }

  report.reste = liste.length - curseur;
  report.duree_s = Math.round((Date.now() - debut) / 100) / 10;

  /* Arriéré réel, au-delà de la fenêtre lue. Un simple comptage, sans ramener
     les lignes. Ne couvre pas les contacts « modifiés depuis » (comparaison
     colonne à colonne, inexprimable en filtre PostgREST) : c'est volontaire,
     ceux-là sont marginaux et rattrapés par la passe du lendemain. */
  const { count } = await admin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .is("hub_synced_at", null);
  if (typeof count === "number") report.jamais_transmis = count;

  if (report.budget_atteint) {
    console.warn(
      `[syncHub] budget de ${budgetMs} ms atteint — ${report.transmis} transmis, ${report.reste} en attente. ` +
        "Relancer /api/cron/hub-sync pour continuer, ou attendre la passe suivante.",
    );
  }

  return report;
}
