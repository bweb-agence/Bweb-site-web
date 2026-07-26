/* =========================================================
   Client Supabase NAVIGATEUR (auth persistée) — pour l'admin.
   À n'importer QUE dans du code client (<script>), jamais en frontmatter :
   le navigateur possède WebSocket nativement (pas besoin de `ws`).
   La sécurité repose sur la RLS : seul un e-mail présent dans `admins`
   peut lire/écrire les données protégées.
   ========================================================= */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabaseBrowser = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "bweb-admin-auth",
    // Désactive la coordination Web Locks (navigator.locks) : dans certains
    // navigateurs/webviews, getSession() peut rester bloqué en attente du verrou.
    // Un admin mono-onglet n'a pas besoin de cette coordination inter-onglets.
    lock: (_name, _acquireTimeout, fn) => fn(),
  },
});
