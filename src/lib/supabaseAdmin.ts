/* =========================================================
   Client Supabase ADMIN (clé service_role) — SERVEUR UNIQUEMENT.
   Contourne la RLS : réservé aux endpoints /api et aux pages /admin
   exécutés côté serveur. NE JAMAIS importer dans un script client.
   La clé n'est jamais exposée au navigateur (pas de préfixe PUBLIC_).
   ========================================================= */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { secret } from "./env";

/** Crée un client à privilèges élevés. À n'appeler que dans du code serveur. */
export function createAdminClient() {
  // Résolution à l'exécution (cf. src/lib/env.ts) : une clé ajoutée dans Vercel
  // après le dernier build reste lisible sans redéploiement.
  const url = secret("PUBLIC_SUPABASE_URL");
  const serviceKey = secret("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error(
      "[supabaseAdmin] PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant — voir .env",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}
