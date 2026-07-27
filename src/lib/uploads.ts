/* =========================================================
   BWEB AGENCE — Config partagée des pièces jointes (devis)
   Source unique de vérité, importée côté client (fileUpload.ts)
   ET côté serveur (api/upload-url.ts, api/contact.ts).
   ========================================================= */

export const BUCKET = "lead-attachments";
export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 Mo par fichier
export const SIGNED_DOWNLOAD_TTL = 60 * 60 * 24 * 30; // liens de téléchargement valables 30 jours

/* Extensions autorisées (repli quand le navigateur envoie un MIME générique). */
export const ALLOWED_EXT = [
  "pdf",
  "jpg", "jpeg", "png", "webp",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "zip",
];

/* Types MIME autorisés. */
export const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg", "image/png", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip", "application/x-zip-compressed",
];

/* Attribut `accept` de l'<input type="file">. */
export const ACCEPT = ALLOWED_EXT.map((e) => "." + e).join(",");

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/* Un fichier est accepté si son MIME OU son extension figure dans la liste. */
export function isAllowedType(name: string, type: string): boolean {
  return ALLOWED_MIME.includes((type || "").toLowerCase()) || ALLOWED_EXT.includes(extOf(name));
}

/* Taille lisible : "820 Ko", "1,4 Mo". */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/* Assainit un nom de fichier pour l'usage dans un chemin de stockage. */
export function safeName(name: string): string {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "fichier";
}
