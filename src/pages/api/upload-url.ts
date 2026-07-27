export const prerender = false;

/* =========================================================
   BWEB AGENCE — URLs d'upload signées pour les pièces jointes (devis)
   -----------------------------------------------------------
   Le navigateur envoie les métadonnées des fichiers (nom/taille/type) ;
   on valide, on s'assure que le bucket privé existe, puis on renvoie une
   URL d'upload SIGNÉE par fichier. Le navigateur téléverse ensuite
   directement vers Supabase (contourne le plafond ~4,5 Mo des fonctions
   Vercel). La clé service reste côté serveur ; aucune policy d'insertion
   publique n'est nécessaire (le token de l'URL signée autorise l'upload).
   ========================================================= */
import type { APIRoute } from "astro";
import { createAdminClient } from "../../lib/supabaseAdmin";
import { BUCKET, MAX_FILES, MAX_FILE_BYTES, isAllowedType, safeName, extOf } from "../../lib/uploads";

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

/* Limite de débit best-effort (par instance). */
const HITS = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 500) HITS.delete(HITS.keys().next().value as string);
  return arr.length > 10;
}

let bucketReady = false;
async function ensureBucket(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  if (bucketReady) return;
  const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_FILE_BYTES });
  // « already exists » n'est pas une erreur pour nous.
  if (error && !/exist/i.test(error.message)) throw error;
  bucketReady = true;
}

type MetaIn = { name?: string; size?: number; type?: string };

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || clientAddress || "unknown";
  if (rateLimited(ip)) return json({ ok: false, error: "rate_limited" }, 429);

  const serviceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey === "A_COMPLETER") return json({ ok: false, error: "not_configured" });

  let files: MetaIn[];
  try {
    const body = await request.json();
    files = Array.isArray(body?.files) ? body.files : [];
  } catch {
    return json({ ok: false, error: "invalid" }, 400);
  }

  if (!files.length) return json({ ok: false, error: "no_files" }, 400);
  if (files.length > MAX_FILES) return json({ ok: false, error: "too_many", max: MAX_FILES }, 400);
  for (const f of files) {
    if (!f?.name || typeof f.size !== "number") return json({ ok: false, error: "invalid" }, 400);
    if (f.size > MAX_FILE_BYTES) return json({ ok: false, error: "too_large", name: f.name }, 400);
    if (!isAllowedType(f.name, f.type || "")) return json({ ok: false, error: "type", name: f.name }, 400);
  }

  try {
    const admin = createAdminClient();
    await ensureBucket(admin);
    const day = new Date().toISOString().slice(0, 10);
    const uploads = [];
    for (const f of files) {
      const ext = extOf(f.name!);
      const path = `${day}/${crypto.randomUUID()}-${safeName(f.name!.replace(/\.[^.]+$/, ""))}${ext ? "." + ext : ""}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) return json({ ok: false, error: "server" }, 500);
      uploads.push({ name: f.name, path: data.path, token: data.token, signedUrl: data.signedUrl });
    }
    return json({ ok: true, bucket: BUCKET, uploads });
  } catch {
    return json({ ok: false, error: "server" }, 500);
  }
};
