/* =========================================================
   Client Supabase PUBLIC (clé anon / publishable).
   Utilisable côté serveur (SSR) et côté navigateur.
   Respecte la sécurité RLS : ne voit que les données publiques
   (articles publiés, sessions publiées, tarifs, FAQ).
   ========================================================= */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Message clair en dev si les variables ne sont pas renseignées.
  console.warn(
    "[supabase] PUBLIC_SUPABASE_URL ou PUBLIC_SUPABASE_ANON_KEY manquant — voir .env",
  );
}

// `createClient` exige une URL valide et lève une exception à l'import sinon :
// on retombe sur un hôte factice (mais syntaxiquement valide) tant que .env
// n'est pas renseigné, pour que les pages échouent proprement à la requête
// (gérée par chaque page) plutôt que de planter tout le rendu.
export const supabase = createClient(url || "https://placeholder.invalid", anonKey || "placeholder-anon-key", {
  auth: { persistSession: false },
  // Node < 22 n'a pas de WebSocket natif : on fournit `ws` pour que le client
  // Supabase s'initialise sans erreur (on n'utilise pas Realtime de toute façon).
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});
