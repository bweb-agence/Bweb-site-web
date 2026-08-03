export const prerender = false;

import type { APIRoute } from "astro";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "../../lib/supabaseAdmin";
import { sendEmail, packConfirmationEmail } from "../../lib/email";
import { enrollDuePackHolders } from "../../lib/enrollPack";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/** Réf pack PK-XXXXX (caractères non ambigus). */
function packRef(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return "PK-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Achat de PACK saisi MANUELLEMENT par un commercial (paiement Mobile Money /
 * espèces encaissé hors site). Crée un pack_purchase confirmé + payé + les droits,
 * envoie le « pass parcours » par e-mail, puis enrôle sur les dates déjà publiées.
 * Réservé au staff (JWT).
 */
export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || !url || !anon) return json({ ok: false, error: "unauthorized" }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "invalid" }, 400); }

  const slug = String(body?.slug || "").trim();
  const name = String(body?.full_name || "").trim();
  const email = String(body?.email || "").trim();
  const phone = String(body?.phone || "").trim();
  const method = String(body?.payment_method || "");
  const attRaw = String(body?.attendance_mode || "");
  const attendance = ["presentiel", "en_ligne"].includes(attRaw) ? attRaw : null;
  if (!slug || name.length < 2) return json({ ok: false, error: "invalid" }, 400);
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return json({ ok: false, error: "invalid_email", message: "E-mail du participant invalide." }, 400);
  if (!["wave", "orange_money", "mtn_momo", "especes"].includes(method)) return json({ ok: false, error: "invalid_payment_method", message: "Moyen de paiement invalide." }, 400);

  // Vérifier le staff via son JWT + récupérer son e-mail (registered_by).
  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: isStaff } = await asUser.rpc("is_staff");
  if (isStaff !== true) return json({ ok: false, error: "forbidden" }, 403);
  const { data: userData } = await asUser.auth.getUser();
  const actor = (userData?.user?.email || "").toLowerCase();

  const admin = createAdminClient();

  const { data: pack } = await admin
    .from("packs")
    .select("id, title, price, active, pack_items(formation_id, sort)")
    .eq("slug", slug)
    .maybeSingle();
  if (!pack || !pack.active) return json({ ok: false, error: "pack_indisponible", message: "Pack indisponible." }, 404);

  const items = ((pack as any).pack_items || []).slice().sort((a: any, b: any) => (a.sort ?? 0) - (b.sort ?? 0));
  if (items.length === 0) return json({ ok: false, error: "pack_vide", message: "Ce pack ne contient aucune formation." }, 409);

  const amountPaid = body?.amount_paid != null ? Math.max(0, parseInt(body.amount_paid) || 0) : pack.price;

  // Insérer l'achat CONFIRMÉ + PAYÉ (retry si collision de référence).
  let purchaseId: string | null = null;
  let ref = "";
  for (let attempt = 0; attempt < 3 && !purchaseId; attempt++) {
    ref = packRef();
    const { data, error } = await admin
      .from("pack_purchases")
      .insert({
        pack_id: pack.id, reference: ref, full_name: name, email, phone: phone || null,
        amount_due: pack.price, amount_paid: amountPaid, attendance_mode: attendance,
        payment_method: method, status: "confirmed", payment_status: "paye", registered_by: actor,
      })
      .select("id").single();
    if (!error && data) purchaseId = data.id;
    else if (error && !String(error.message || "").toLowerCase().includes("duplicate")) return json({ ok: false, error: "server" }, 500);
  }
  if (!purchaseId) return json({ ok: false, error: "server" }, 500);

  const { error: entErr } = await admin
    .from("pack_entitlements")
    .insert(items.map((it: any) => ({ purchase_id: purchaseId, formation_id: it.formation_id })));
  if (entErr) return json({ ok: false, error: "server" }, 500);

  // E-mail « pass parcours ».
  const { data: fnames } = await admin.from("formations").select("id,title").in("id", items.map((i: any) => i.formation_id));
  const titleById = new Map((fnames || []).map((f: any) => [f.id, f.title]));
  const c = packConfirmationEmail({
    reference: ref, full_name: name, pack_title: pack.title, amount: amountPaid,
    items: items.map((it: any) => ({ title: titleById.get(it.formation_id) || "Formation", date: null })),
  });
  try { await sendEmail({ to: email, subject: c.subject, html: c.html }); } catch { /* non bloquant */ }

  // Enrôle immédiatement sur les dates déjà publiées (envoie les billets).
  try { await enrollDuePackHolders(admin); } catch { /* non bloquant : le cron rattrape */ }

  return json({ ok: true, reference: ref });
};
