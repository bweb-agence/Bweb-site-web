/* =========================================================
   BWEB — Composeur d'e-mails (modèles) réutilisant le cœur TipTap.
   Monte le même éditeur que les articles ; enregistre dans email_templates.
   ========================================================= */
import { supabaseBrowser } from "../lib/supabaseBrowser";
import { toast } from "./adminUtils";
import { mountEditor, type EditorHandle } from "./editor/editor";
import { uploadMedia } from "./editor/uploadMedia";

export async function initEmailEditor() {
  const root = document.getElementById("ed-root");
  if (!root) return;
  let id = root.dataset.id || "";

  const { data: { session } } = await supabaseBrowser.auth.getSession();
  if (!session) return; // le layout gère la redirection

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
  const nameEl = $<HTMLTextAreaElement>("#f-name");
  const subjectEl = $<HTMLInputElement>("#f-subject");
  const stateEl = $("#ed-autostate");

  // Charge le modèle existant
  let record: any = null;
  if (id) {
    const { data } = await supabaseBrowser.from("email_templates").select("*").eq("id", id).maybeSingle();
    record = data;
    if (record) {
      nameEl.value = record.name || "";
      subjectEl.value = record.subject || "";
      document.getElementById("ed-crumb-doc")!.textContent = record.name || "Sans titre";
    }
  }

  const handle: EditorHandle = mountEditor({
    element: $("#ed-editor"),
    toolbar: $("#ed-toolbar"),
    content: record?.body_html || "",
    placeholder: "Rédigez votre e-mail, ou tapez « / » pour insérer un bloc…",
    uploadImage: (f) => uploadMedia(f, "emails"),
    onChange: () => markDirty(),
  });

  // Insertion des variables de personnalisation au curseur
  document.querySelectorAll<HTMLElement>("[data-var]").forEach((b) =>
    b.addEventListener("click", () => { handle.editor.chain().focus().insertContent(`{${b.dataset.var}}`).run(); markDirty(); }));

  let dirty = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function markDirty() {
    dirty = true;
    if (stateEl) stateEl.textContent = "Modifié…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { if (id) save(true); }, 1500); // autosave une fois créé
  }
  nameEl.addEventListener("input", () => { document.getElementById("ed-crumb-doc")!.textContent = nameEl.value || "Sans titre"; markDirty(); });
  subjectEl.addEventListener("input", markDirty);

  async function save(auto = false) {
    clearTimeout(saveTimer);
    const payload = {
      name: (nameEl.value || "Nouvel e-mail").trim().slice(0, 120),
      subject: subjectEl.value.trim().slice(0, 200),
      body_html: handle.getHTML(),
    };
    if (stateEl) stateEl.textContent = "Enregistrement…";
    try {
      if (id) {
        const { error } = await supabaseBrowser.from("email_templates").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabaseBrowser.from("email_templates").insert(payload).select("id").single();
        if (error || !data) throw error;
        id = data.id;
        root!.dataset.id = id;
        history.replaceState(null, "", `/admin/emails/${id}`);
      }
      dirty = false;
      if (stateEl) stateEl.textContent = "Enregistré ✓";
      if (!auto) toast("E-mail enregistré ✓");
    } catch {
      if (stateEl) stateEl.textContent = "Échec de l'enregistrement";
      toast("Enregistrement impossible.", "err");
    }
  }

  document.getElementById("ed-save")?.addEventListener("click", () => save(false));
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(false); }
  });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
}
