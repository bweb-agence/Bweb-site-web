/* =========================================================
   BWEB — Éditeur de contenu riche (WYSIWYG) basé sur TipTap v3.
   Fournit : barre d'outils, commande « / » (menu de blocs),
   upload d'images (bucket Supabase « media »), collage/glisser d'images.
   Réutilisé pour les articles, formations et sessions.
   ========================================================= */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { Callout } from "./callout";

export type MountOptions = {
  element: HTMLElement;               // conteneur où monter l'éditeur
  toolbar: HTMLElement;               // barre d'outils (boutons [data-cmd])
  content?: string;                   // HTML initial
  placeholder?: string;
  uploadImage: (file: File) => Promise<string | null>;
  onChange?: () => void;              // notifié à chaque modification (autosave)
};

export type EditorHandle = {
  editor: Editor;
  getHTML: () => string;
  isEmpty: () => boolean;
  destroy: () => void;
};

/* ---------- Menu « / » (insertion de blocs, façon Notion/WordPress) ---------- */
type SlashItem = {
  title: string; hint: string; icon: string; keywords: string;
  run: (e: Editor, range: { from: number; to: number }) => void;
};

function slashItems(pickImage: () => void): SlashItem[] {
  return [
    { title: "Titre 2", hint: "Grande section", icon: "H2", keywords: "titre heading h2 section",
      run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run() },
    { title: "Titre 3", hint: "Sous-section", icon: "H3", keywords: "titre heading h3 sous-section",
      run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run() },
    { title: "Texte", hint: "Paragraphe simple", icon: "¶", keywords: "texte paragraphe normal",
      run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
    { title: "Liste à puces", hint: "Liste non ordonnée", icon: "•", keywords: "liste puces bullet ul",
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
    { title: "Liste numérotée", hint: "Étapes ordonnées", icon: "1.", keywords: "liste numerotee ordered ol etapes",
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
    { title: "Citation", hint: "Mise en avant d'une phrase", icon: "❝", keywords: "citation quote blockquote",
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
    { title: "Encadré", hint: "Bloc d'information mis en avant", icon: "💡", keywords: "encadre callout info note aide astuce important",
      run: (e, r) => e.chain().focus().deleteRange(r).wrapIn("callout").run() },
    { title: "Bloc de code", hint: "Extrait de code", icon: "</>", keywords: "code bloc pre",
      run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run() },
    { title: "Tableau", hint: "3 × 3 avec en-tête", icon: "▦", keywords: "tableau table grille",
      run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { title: "Séparateur", hint: "Ligne horizontale", icon: "―", keywords: "separateur ligne hr divider trait",
      run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
    { title: "Image", hint: "Depuis votre ordinateur", icon: "🖼", keywords: "image photo illustration media",
      run: (e, r) => { e.chain().focus().deleteRange(r).run(); pickImage(); } },
  ];
}

function attachSlashMenu(editor: Editor, pickImage: () => void) {
  const items = slashItems(pickImage);
  const menu = document.createElement("div");
  menu.className = "ed-slash";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;
  document.body.appendChild(menu);

  let open = false, active = 0, filtered: SlashItem[] = [], range = { from: 0, to: 0 };

  const close = () => { open = false; menu.hidden = true; };

  function draw() {
    menu.innerHTML = filtered.length
      ? filtered.map((it, i) => `
        <button class="ed-slash-item ${i === active ? "on" : ""}" data-i="${i}" role="option" aria-selected="${i === active}">
          <span class="ic">${it.icon}</span>
          <span class="tx"><span class="t">${it.title}</span><span class="h">${it.hint}</span></span>
        </button>`).join("")
      : `<div class="ed-slash-empty">Aucun bloc</div>`;
    menu.querySelectorAll<HTMLElement>(".ed-slash-item").forEach((b) =>
      b.addEventListener("mousedown", (ev) => { ev.preventDefault(); choose(parseInt(b.dataset.i!)); }));
  }

  function place() {
    const { view } = editor;
    const c = view.coordsAtPos(editor.state.selection.from);
    const mh = menu.offsetHeight || 300, gap = 6;
    let top = c.bottom + gap;
    if (top + mh > window.innerHeight - 8) top = c.top - mh - gap; // bascule au-dessus si déborde
    menu.style.top = Math.max(8, top) + "px";
    menu.style.left = Math.min(c.left, window.innerWidth - menu.offsetWidth - 12) + "px";
  }

  function choose(i: number) {
    const it = filtered[i]; if (!it) return;
    close();
    it.run(editor, range);
  }

  function sync() {
    const { state } = editor;
    const { $from, empty } = state.selection as any;
    if (!empty) return close();
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "￼");
    const m = /(?:^|\s)\/([^\/\s]*)$/.exec(textBefore);
    if (!m) return close();
    const query = m[1].toLowerCase();
    range = { from: $from.pos - m[1].length - 1, to: $from.pos };
    filtered = items.filter((it) => !query || (it.title + " " + it.keywords).toLowerCase().includes(query));
    active = 0; open = true; menu.hidden = false;
    draw(); place();
  }

  editor.on("selectionUpdate", sync);
  editor.on("update", sync);

  // Navigation clavier — capture avant ProseMirror.
  const onKey = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % Math.max(1, filtered.length); draw(); place(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + filtered.length) % Math.max(1, filtered.length); draw(); place(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };
  editor.view.dom.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", () => { if (open) place(); }, true);
  document.addEventListener("mousedown", (e) => { if (open && !menu.contains(e.target as Node)) close(); });

  return () => { menu.remove(); };
}

/* ---------- Barre d'outils ---------- */
function attachToolbar(editor: Editor, toolbar: HTMLElement, pickImage: () => void) {
  const run: Record<string, () => void> = {
    bold: () => editor.chain().focus().toggleBold().run(),
    italic: () => editor.chain().focus().toggleItalic().run(),
    underline: () => editor.chain().focus().toggleUnderline().run(),
    strike: () => editor.chain().focus().toggleStrike().run(),
    code: () => editor.chain().focus().toggleCode().run(),
    bulletList: () => editor.chain().focus().toggleBulletList().run(),
    orderedList: () => editor.chain().focus().toggleOrderedList().run(),
    blockquote: () => editor.chain().focus().toggleBlockquote().run(),
    callout: () => editor.chain().focus().toggleWrap("callout").run(),
    codeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
    hr: () => editor.chain().focus().setHorizontalRule().run(),
    table: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    tableAddCol: () => editor.chain().focus().addColumnAfter().run(),
    tableDelCol: () => editor.chain().focus().deleteColumn().run(),
    tableAddRow: () => editor.chain().focus().addRowAfter().run(),
    tableDelRow: () => editor.chain().focus().deleteRow().run(),
    tableDel: () => editor.chain().focus().deleteTable().run(),
    image: () => pickImage(),
    undo: () => editor.chain().focus().undo().run(),
    redo: () => editor.chain().focus().redo().run(),
    link: () => {
      const prev = editor.getAttributes("link").href as string | undefined;
      const url = window.prompt("Adresse du lien (laisser vide pour retirer) :", prev || "https://");
      if (url === null) return;
      if (url === "" ) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    },
  };

  toolbar.querySelectorAll<HTMLElement>("[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.preventDefault(); run[btn.dataset.cmd!]?.(); });
  });

  // Sélecteur de style de bloc custom (Paragraphe / Titre 1 → 5)
  const styleContainer = toolbar.querySelector<HTMLElement>("[data-style]");
  const styleSync = styleContainer ? attachStyleDropdown(editor, styleContainer) : null;

  const marks = ["bold", "italic", "underline", "strike", "code", "blockquote", "callout",
    "bulletList", "orderedList", "codeBlock", "link"];
  const sync = () => {
    marks.forEach((name) => {
      const b = toolbar.querySelector<HTMLElement>(`[data-cmd="${name}"]`);
      if (b) b.classList.toggle("on", editor.isActive(name));
    });
    styleSync?.();
    // Contrôles de tableau : visibles seulement quand le curseur est dans un tableau.
    const inTable = editor.isActive("table");
    toolbar.querySelectorAll<HTMLElement>("[data-table-only]").forEach((el) => { el.hidden = !inTable; });
  };
  sync();
  editor.on("selectionUpdate", sync);
  editor.on("transaction", sync);
}

/* ---------- Dropdown de style custom (design maison, aligné branding) ---------- */
function attachStyleDropdown(editor: Editor, container: HTMLElement): () => void {
  const OPTIONS = [
    { v: "paragraph", label: "Paragraphe" },
    { v: "1", label: "Titre 1" },
    { v: "2", label: "Titre 2" },
    { v: "3", label: "Titre 3" },
    { v: "4", label: "Titre 4" },
    { v: "5", label: "Titre 5" },
  ];
  container.classList.add("ed-style");
  container.innerHTML =
    `<button type="button" class="ed-style-btn" aria-haspopup="listbox" aria-expanded="false">
       <span class="lbl">Paragraphe</span><span class="car" aria-hidden="true"></span>
     </button>
     <div class="ed-style-menu" role="listbox" hidden>
       ${OPTIONS.map((o) => `<button type="button" class="ed-style-opt s-${o.v}" role="option" data-v="${o.v}">${o.label}</button>`).join("")}
     </div>`;
  const btn = container.querySelector<HTMLElement>(".ed-style-btn")!;
  const menu = container.querySelector<HTMLElement>(".ed-style-menu")!;
  const lbl = container.querySelector<HTMLElement>(".lbl")!;
  const setOpen = (o: boolean) => { menu.hidden = !o; btn.setAttribute("aria-expanded", String(o)); };
  const apply = (v: string) => {
    if (v === "paragraph") editor.chain().focus().setNode("paragraph").run();
    else editor.chain().focus().setNode("heading", { level: Number(v) }).run();
    setOpen(false);
  };
  btn.addEventListener("click", (e) => { e.preventDefault(); setOpen(menu.hidden); });
  menu.querySelectorAll<HTMLElement>("[data-v]").forEach((o) =>
    o.addEventListener("mousedown", (e) => { e.preventDefault(); apply(o.dataset.v!); }));
  document.addEventListener("mousedown", (e) => { if (!container.contains(e.target as Node)) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  return () => {
    let cur = "paragraph";
    for (let l = 1; l <= 5; l++) if (editor.isActive("heading", { level: l })) { cur = String(l); break; }
    lbl.textContent = OPTIONS.find((o) => o.v === cur)!.label;
    menu.querySelectorAll<HTMLElement>("[data-v]").forEach((o) => o.classList.toggle("on", o.dataset.v === cur));
  };
}

/* ---------- Montage ---------- */
export function mountEditor(opts: MountOptions): EditorHandle {
  // Sélecteur de fichier caché, partagé par la barre d'outils et le menu « / ».
  const fileInput = document.createElement("input");
  fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.hidden = true;
  document.body.appendChild(fileInput);

  const insertImage = async (file: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = await opts.uploadImage(file);
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };
  const pickImage = () => { fileInput.value = ""; fileInput.click(); };
  fileInput.addEventListener("change", () => { const f = fileInput.files?.[0]; if (f) insertImage(f); });

  const editor = new Editor({
    element: opts.element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener nofollow", target: "_blank" } },
        codeBlock: { HTMLAttributes: { class: "ed-code" } },
      }),
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: "ed-img" } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TableKit.configure({ table: { resizable: true, HTMLAttributes: { class: "ed-table" } } }),
      Callout,
      Placeholder.configure({
        includeChildren: false,
        placeholder: ({ node }: any) =>
          node.type.name === "heading" ? "Titre…" : (opts.placeholder || "Écrivez, ou tapez « / » pour insérer un bloc…"),
      }),
    ],
    content: opts.content || "",
    editorProps: {
      attributes: { class: "ed-content", spellcheck: "true" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files || []).filter((f) => f.type.startsWith("image/"));
        if (files.length) { event.preventDefault(); files.forEach(insertImage); return true; }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files || []).filter((f) => f.type.startsWith("image/"));
        if (files.length) { event.preventDefault(); files.forEach(insertImage); return true; }
        return false;
      },
    },
    onUpdate: () => opts.onChange?.(),
  });

  attachToolbar(editor, opts.toolbar, pickImage);
  const detachSlash = attachSlashMenu(editor, pickImage);

  return {
    editor,
    getHTML: () => (editor.isEmpty ? "" : editor.getHTML()),
    isEmpty: () => editor.isEmpty,
    destroy: () => { detachSlash(); editor.destroy(); fileInput.remove(); },
  };
}
