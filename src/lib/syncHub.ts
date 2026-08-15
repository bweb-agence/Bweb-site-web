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

/** Nombre de contacts traités par passe. Borne le temps d'exécution serverless. */
const BATCH = 300;

export interface HubSyncReport {
  /** Contacts éligibles traités pendant la passe. */
  traites: number;
  transmis: number;
  echecs: number;
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
  const report: HubSyncReport = { traites: 0, transmis: 0, echecs: 0 };

  /* La clé du tunnel « site » est distincte de celle du tunnel webinaire : côté
     ACQ Hub, chaque tunnel a la sienne (le Hub n'en stocke que le hash). On
     accepte les anciens noms en repli pour ne pas dépendre d'un renommage. */
  const ingestUrl = secret("INGEST_URL");
  const ingestKey = secret("TUNNEL_KEY_SITE", "TUNNEL_KEY_WEBINAIRE_INITIATION", "TUNNEL_INGEST_KEY");
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

  for (const contact of candidats as ContactRow[]) {
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
          type: "contact_synced",
          occurred_at: new Date().toISOString(),
          contact: {
            phone: contact.phone || undefined,
            email: contact.email || undefined,
            first_name: (contact.full_name || "").trim().split(/\s+/)[0] || undefined,
            last_name: (contact.full_name || "").trim().split(/\s+/).slice(1).join(" ") || undefined,
          },
          payload: {
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
        continue; // pas d'horodatage : la passe suivante réessaiera
      }

      // Horodaté seulement après un succès — sinon un échec serait oublié.
      await admin.from("contacts").update({ hub_synced_at: new Date().toISOString() }).eq("id", contact.id);
      report.transmis++;
    } catch (err) {
      report.echecs++;
      console.error(`[syncHub] contact ${contact.id} injoignable —`, err instanceof Error ? err.message : err);
    }
  }

  return report;
}
