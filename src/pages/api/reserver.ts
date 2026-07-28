export const prerender = false;

import type { APIRoute } from "astro";
import { createAdminClient } from "../../lib/supabaseAdmin";
import { sendEmail, ackEmail } from "../../lib/email";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request }) => {
  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") {
    // La clé service_role n'est pas encore configurée : la modale bascule sur WhatsApp.
    return json({ ok: false, error: "not_configured" });
  }

  try {
    const fd = await request.formData();
    const lines = JSON.parse((fd.get("lines") as string) || "[]");
    const name = ((fd.get("name") as string) || "").trim();
    const email = ((fd.get("email") as string) || "").trim();
    const phone = ((fd.get("phone") as string) || "").trim();
    const company = ((fd.get("company") as string) || "").trim();
    const method = (fd.get("payment_method") as string) || null;
    const reference = (fd.get("payment_reference") as string) || null;
    const isDeposit = fd.get("is_deposit") === "1";
    const attendanceRaw = (fd.get("attendance_mode") as string) || "";
    const attendanceMode = ["presentiel", "en_ligne"].includes(attendanceRaw) ? attendanceRaw : null;
    const proof = fd.get("proof") as File | null;

    if (!name || !email || !phone || !Array.isArray(lines) || lines.length === 0) {
      return json({ ok: false, error: "invalid" }, 400);
    }

    const admin = createAdminClient();

    // Justificatif -> Storage privé (bucket payment-proofs)
    let proofUrl: string | null = null;
    if (proof && typeof proof.arrayBuffer === "function" && proof.size > 0) {
      const ext = (proof.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
      const buf = new Uint8Array(await proof.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from("payment-proofs")
        .upload(path, buf, { contentType: proof.type || "image/jpeg", upsert: false });
      if (!upErr) proofUrl = path;
    }

    // Une réservation par tarif (fonction transactionnelle anti-surbooking)
    const refs: string[] = [];
    for (const l of lines) {
      const { data, error } = await admin.rpc("create_booking", {
        p_ticket_type_id: l.ticket_type_id,
        p_quantity: l.quantity,
        p_full_name: name,
        p_email: email,
        p_phone: phone,
        p_company: company || null,
        p_payment_method: method,
        p_payment_reference: reference,
        p_payment_proof_url: proofUrl,
        p_is_deposit: isDeposit,
        p_attendance_mode: attendanceMode,
      });
      if (error) return json({ ok: false, error: "server" }, 500);
      if (!data?.ok) return json({ ok: false, error: data?.error || "server", remaining: data?.remaining });
      refs.push(data.reference);
    }

    // Accusé de réception par e-mail (Bird) — silencieux si non configuré.
    const { data: sessRow } = await admin
      .from("bookings").select("sessions(title)").eq("reference", refs[0]).maybeSingle();
    const sessionTitle = (sessRow as any)?.sessions?.title || "votre formation";
    const ack = ackEmail({ reference: refs[0], full_name: name, session_title: sessionTitle });
    await sendEmail({ to: email, subject: ack.subject, html: ack.html });
    return json({ ok: true, reference: refs[0], references: refs });
  } catch {
    return json({ ok: false, error: "server" }, 500);
  }
};
