/* =========================================================
   BWEB AGENCE — Pièces jointes du devis (multi-fichiers)
   -----------------------------------------------------------
   Gère chaque conteneur [data-file-upload] :
     • ajout CUMULATIF (plusieurs sélections/glisser-déposer),
     • liste des fichiers avec taille + croix ✕ pour retirer,
     • validation (type / taille / nombre) via src/lib/uploads.ts,
     • upload DIRECT navigateur → Supabase (URLs signées), pour
       contourner le plafond ~4,5 Mo des fonctions Vercel.
   Expose `form.__prepareUploads()` que forms.ts appelle à la
   soumission ; renvoie la liste [{ path, name }] à joindre à l'e-mail.
   Le client Supabase est importé en DYNAMIQUE (code-split) : il n'alourdit
   que la page devis, au moment de l'upload.
   ========================================================= */
import { ACCEPT, BUCKET, MAX_FILES, MAX_FILE_BYTES, isAllowedType, humanSize } from "../lib/uploads";

const REMOVE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';

type Attachment = { path: string; name: string };

export function initFileUpload(): void {
  document.querySelectorAll<HTMLElement>("[data-file-upload]").forEach((root) => {
    const input = root.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input || root.dataset.fuReady) return;
    root.dataset.fuReady = "1";
    input.setAttribute("accept", ACCEPT);

    const drop = root.querySelector<HTMLElement>(".file-drop");
    let list = root.querySelector<HTMLUListElement>(".file-list");
    if (!list) { list = document.createElement("ul"); list.className = "file-list"; root.appendChild(list); }
    let errEl = root.querySelector<HTMLElement>(".file-error");
    if (!errEl) { errEl = document.createElement("p"); errEl.className = "file-error"; errEl.setAttribute("role", "alert"); root.appendChild(errEl); }

    const files: File[] = [];
    const keyOf = (f: File) => `${f.name}:${f.size}`;
    const setError = (msg: string) => { errEl!.textContent = msg; errEl!.hidden = !msg; };

    function render(): void {
      list!.textContent = "";
      files.forEach((f, i) => {
        const li = document.createElement("li");
        li.className = "file-item";
        const name = document.createElement("span");
        name.className = "file-item__name";
        name.textContent = f.name;
        const size = document.createElement("span");
        size.className = "file-item__size";
        size.textContent = humanSize(f.size);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "file-item__remove";
        btn.setAttribute("aria-label", `Retirer ${f.name}`);
        btn.innerHTML = REMOVE_ICON; // icône statique, aucune donnée utilisateur
        btn.addEventListener("click", () => { files.splice(i, 1); setError(""); render(); });
        li.append(name, size, btn);
        list!.appendChild(li);
      });
      list!.hidden = files.length === 0;
    }

    function add(incoming: FileList | File[]): void {
      const errs: string[] = [];
      for (const f of Array.from(incoming)) {
        if (files.length >= MAX_FILES) { errs.push(`Maximum ${MAX_FILES} fichiers.`); break; }
        if (files.some((x) => keyOf(x) === keyOf(f))) continue; // dédoublonnage
        if (!isAllowedType(f.name, f.type)) { errs.push(`« ${f.name} » : type non autorisé.`); continue; }
        if (f.size > MAX_FILE_BYTES) { errs.push(`« ${f.name} » : dépasse ${humanSize(MAX_FILE_BYTES)}.`); continue; }
        files.push(f);
      }
      setError(errs.join(" "));
      render();
    }

    input.addEventListener("change", () => {
      if (input.files) add(input.files);
      input.value = ""; // permet de re-sélectionner le même fichier et d'accumuler
    });

    // Glisser-déposer
    if (drop) {
      ["dragenter", "dragover"].forEach((ev) =>
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-drag"); }));
      ["dragleave", "drop"].forEach((ev) =>
        drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("is-drag"); }));
      drop.addEventListener("drop", (e) => {
        const dt = (e as DragEvent).dataTransfer;
        if (dt?.files?.length) add(dt.files);
      });
    }

    // Appelé par forms.ts à la soumission : téléverse et renvoie [{path,name}].
    const form = root.closest("form");
    if (form) {
      (form as unknown as { __prepareUploads?: () => Promise<Attachment[]> }).__prepareUploads = async () => {
        if (!files.length) return [];
        setError("");
        const res = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })) }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          setError(
            data?.error === "not_configured"
              ? "Envoi de fichiers momentanément indisponible — votre demande part sans les pièces jointes."
              : "Impossible de préparer l'envoi des fichiers ; votre demande part sans les pièces jointes.",
          );
          return [];
        }
        const { supabaseBrowser } = await import("../lib/supabaseBrowser");
        const attachments: Attachment[] = [];
        for (let i = 0; i < data.uploads.length; i++) {
          const u = data.uploads[i];
          const file = files[i];
          const { error } = await supabaseBrowser.storage
            .from(data.bucket || BUCKET)
            .uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || undefined });
          if (!error) attachments.push({ path: u.path, name: u.name || file.name });
        }
        if (attachments.length < files.length) {
          setError(`${files.length - attachments.length} fichier(s) n'ont pas pu être envoyés.`);
        }
        return attachments;
      };
    }
  });
}
