export const prerender = false;

/* =========================================================
   Lien de connexion à l'espace admin, envoyé par Bird
   -----------------------------------------------------------
   POURQUOI CETTE ROUTE. `signInWithOtp()` laisse Supabase expédier le message
   par son SMTP de démonstration : quelques envois par heure, depuis un domaine
   que personne n'a authentifié. Constaté le 28/08/2026 sur un nouvel accès —
   le message part chez Supabase et n'arrive jamais.
   Le lien est donc fabriqué ici avec la clé de service, puis expédié par Bird
   comme tout le reste du courrier du site : même domaine, DKIM et DMARC déjà
   vérifiés, réputation partagée.

   QUI PEUT EN DEMANDER UN. Uniquement une adresse présente dans `admins`.
   Sans ce filtre, la route serait un relais d'e-mails ouvert : n'importe qui
   pourrait faire partir des messages depuis notre domaine vers l'adresse de
   son choix, et brûler notre réputation d'expéditeur.

   CE QU'ELLE RÉPOND. Toujours `{ ok: true }`, que l'adresse ait droit ou non.
   Répondre « inconnue » transformerait la page de connexion en annuaire :
   on saurait, adresse par adresse, qui administre le site.
   ========================================================= */
import type { APIRoute } from "astro";
import { createAdminClient } from "../../../lib/supabaseAdmin";
import { sendEmail, lienConnexionEmail } from "../../../lib/email";

const SITE = "https://www.bwebagence.com";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/* Limite de débit best-effort, par instance : coupe les rafales sans
   prétendre remplacer un compteur distribué (même approche que contact.ts). */
const FENETRE_MS = 300_000;
const MAX = 3;
const COUPS = new Map<string, number[]>();
function trop(cle: string): boolean {
  const t = Date.now();
  const arr = (COUPS.get(cle) || []).filter((x) => t - x < FENETRE_MS);
  arr.push(t);
  COUPS.set(cle, arr);
  if (COUPS.size > 500) COUPS.delete(COUPS.keys().next().value as string);
  return arr.length > MAX;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let email = "";
  let suite = "/admin";
  try {
    const b = await request.json();
    email = String(b.email || "").trim().toLowerCase().slice(0, 160);
    // Chemin interne uniquement : une URL absolue permettrait de rediriger la
    // session fraîchement ouverte vers un site tiers.
    const s = String(b.next || "");
    if (/^\/[a-zA-Z0-9/_-]*$/.test(s)) suite = s;
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return json({ ok: false, error: "email_invalide" });
  if (trop(clientAddress || "0.0.0.0") || trop(email)) return json({ ok: false, error: "rate_limited" }, 429);

  const admin = createAdminClient();

  const { data: droit } = await admin.from("admins").select("email").ilike("email", email).maybeSingle();
  if (!droit) return json({ ok: true }); // silence volontaire

  /* Pas besoin de créer le compte au préalable : la documentation de
     `generateLink` est explicite — le type `magiclink` s'en charge lui-même si
     l'utilisateur n'existe pas encore. C'est ce qui permet à une personne tout
     juste ajoutée dans `admins` de se connecter sans qu'on lui fabrique un
     identifiant à la main. */
  const { data: lien, error: errLien } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${SITE}${suite}` },
  });
  if (errLien || !lien?.properties?.action_link) {
    console.error("[connexion] lien non généré —", errLien?.message);
    return json({ ok: false, error: "server" }, 500);
  }

  const m = lienConnexionEmail({ lien: lien.properties.action_link, email });
  const envoye = await sendEmail({ to: email, subject: m.subject, html: m.html, text: m.text });
  if (!envoye) {
    console.error(`[connexion] Bird n'a pas accepté le message pour ${email}`);
    return json({ ok: false, error: "email" }, 502);
  }
  return json({ ok: true });
};
