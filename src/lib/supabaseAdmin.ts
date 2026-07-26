/* =========================================================
   Client Supabase ADMIN (clé service_role) — SERVEUR UNIQUEMENT.
   Contourne la RLS : réservé aux endpoints /api et aux pages /admin
   exécutés côté serveur. NE JAMAIS importer dans un script client.
   La clé n'est jamais exposée au navigateur (pas de préfixe PUBLIC_).
   ========================================================= */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

/** Crée un client à privilèges élevés. À n'appeler que dans du code serveur. */
export function createAdminClient() {
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
