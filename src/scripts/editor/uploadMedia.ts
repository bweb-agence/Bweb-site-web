/* Upload d'un fichier image vers le bucket public « media » de Supabase.
   Renvoie l'URL publique, ou null en cas d'échec. */
import { supabaseBrowser } from "../../lib/supabaseBrowser";
import { toast } from "../adminUtils";

export async function uploadMedia(file: File, folder = "contenu"): Promise<string | null> {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) { toast("Image trop lourde (5 Mo max).", "err"); return null; }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const d = new Date();
  const path = `${folder}/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseBrowser.storage.from("media").upload(path, file, {
    contentType: file.type || "image/jpeg", upsert: false, cacheControl: "31536000",
  });
  if (error) { toast("Envoi de l'image impossible.", "err"); return null; }
  return supabaseBrowser.storage.from("media").getPublicUrl(path).data.publicUrl;
}
