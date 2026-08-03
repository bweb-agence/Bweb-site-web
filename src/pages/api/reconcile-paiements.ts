export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../lib/supabaseAdmin";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/**
 * Cron de réconciliation des paiements Money Fusion.
 * Filet ultime : rattrape les réservations « pending » qui ont été payées mais
 * que ni la page de retour ni le webhook n'ont confirmées (onglet fermé + webhook
 * manqué). Pour chaque jeton distinct, on rejoue /api/paiement-confirme (qui
 * re-vérifie le paiement auprès de Money Fusion et confirme, de façon idempotente).
 *
 * Déclencheurs : cron Vercel (Authorization: Bearer CRON_SECRET, ajouté auto par
 * Vercel) OU cron externe (Hostinger) avec ?key=CRON_SECRET.
 */
async function handle(request: Request): Promise<Response> {
  const secret = import.meta.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") || "";
    const key = new URL(request.url).searchParams.get("key") || "";
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
  }

  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const origin = new URL(request.url).origin;
  const admin = createAdminClient();

  // Réservations en attente, payées en ligne (Money Fusion ou Paystack), des 3 derniers jours.
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: pend } = await admin
    .from("bookings")
    .select("payment_reference, payment_method")
    .eq("status", "pending")
    .in("payment_method", ["money_fusion", "paystack"])
    .not("payment_reference", "is", null)
    .gte("created_at", since);

  // Achats de pack en attente (même filet de sécurité, table pack_purchases).
  const { data: pendPacks } = await admin
    .from("pack_purchases")
    .select("payment_reference, payment_method")
    .eq("status", "pending")
    .in("payment_method", ["money_fusion", "paystack"])
    .not("payment_reference", "is", null)
    .gte("created_at", since);

  // Référence unique → passerelle à interroger.
  const byRef = new Map<string, string>();
  for (const b of [...(pend || []), ...(pendPacks || [])]) {
    const ref = (b as any).payment_reference;
    if (ref && !byRef.has(ref)) byRef.set(ref, (b as any).payment_method === "paystack" ? "paystack" : "money_fusion");
  }

  let confirmed = 0;
  for (const [token, gateway] of byRef) {
    try {
      const r = await fetch(`${origin}/api/paiement-confirme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, gateway }),
      });
      const d: any = await r.json();
      confirmed += Number(d?.confirmed) || 0;
    } catch {
      // on continue : les références suivantes seront tentées au prochain passage
    }
  }

  return json({ ok: true, checked: byRef.size, confirmed });
}

export const GET: APIRoute = ({ request }) => handle(request);
export const POST: APIRoute = ({ request }) => handle(request);
