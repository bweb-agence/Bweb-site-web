export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../lib/supabaseAdmin";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/** Code de référence pack : PK-XXXXX (caractères non ambigus). */
function packRef(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return "PK-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Crée un achat de pack « en attente » + un « droit à une place »
 * (pack_entitlement) par formation incluse. Le prix vient du pack en base
 * (jamais du client). Le jeton de paiement (Paystack/Money Fusion) est stocké
 * comme payment_reference : il sert à confirmer l'achat au retour du paiement
 * (cf. lib/confirmPack). Symétrique de /api/reserver.
 */
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }

  const slug = String(body?.slug || "").trim();
  const packId = String(body?.pack_id || "").trim();
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim();
  const phone = String(body?.phone || "").trim();
  const attRaw = String(body?.attendance_mode || "");
  const attendanceMode = ["presentiel", "en_ligne"].includes(attRaw) ? attRaw : null;
  const reference = String(body?.payment_reference || "").trim();
  const methodRaw = String(body?.payment_method || "");
  const paymentMethod = ["paystack", "money_fusion"].includes(methodRaw) ? methodRaw : null;

  if ((!slug && !packId) || !name || !email || !phone) return json({ ok: false, error: "invalid" }, 400);

  const admin = createAdminClient();

  // Charger le pack ACTIF + les formations incluses (prix = autorité serveur).
  let q = admin.from("packs").select("id, title, price, active, pack_items(formation_id, sort)");
  q = packId ? q.eq("id", packId) : q.eq("slug", slug);
  const { data: pack } = await q.maybeSingle();
  if (!pack || !pack.active) return json({ ok: false, error: "pack_indisponible" }, 404);

  const items = ((pack as any).pack_items || [])
    .slice()
    .sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
  if (items.length === 0) return json({ ok: false, error: "pack_vide" }, 409);

  // Insérer l'achat « en attente » (une seule tentative de référence, retry si collision).
  let purchaseId: string | null = null;
  let ref = "";
  for (let attempt = 0; attempt < 3 && !purchaseId; attempt++) {
    ref = packRef();
    const { data, error } = await admin
      .from("pack_purchases")
      .insert({
        pack_id: pack.id,
        reference: ref,
        full_name: name,
        email,
        phone,
        amount_due: pack.price,
        attendance_mode: attendanceMode,
        payment_method: paymentMethod,
        payment_reference: reference || null,
        status: "pending",
        payment_status: "attente",
      })
      .select("id")
      .single();
    if (!error && data) purchaseId = data.id;
    else if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
      return json({ ok: false, error: "server" }, 500);
    }
  }
  if (!purchaseId) return json({ ok: false, error: "server" }, 500);

  // Un « droit à une place » par formation incluse.
  const entitlements = items.map((it: any) => ({ purchase_id: purchaseId, formation_id: it.formation_id }));
  const { error: entErr } = await admin.from("pack_entitlements").insert(entitlements);
  if (entErr) return json({ ok: false, error: "server" }, 500);

  return json({ ok: true, reference: ref });
};
