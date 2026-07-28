/* =========================================================
   BWEB — Contrôleur de la page d'édition plein écran.
   Un seul écran pour Article / Formation / Session :
   charge l'enregistrement, monte l'éditeur riche, gère les
   réglages, le statut, l'autosave, les tarifs et la couverture.
   ========================================================= */
import { supabaseBrowser } from "../lib/supabaseBrowser";
import { slugify, dtLocalValue, toast, esc } from "./adminUtils";
import { mountEditor, type EditorHandle } from "./editor/editor";
import { uploadMedia } from "./editor/uploadMedia";
import { analyzeSeo } from "./editor/seo";
import { marked } from "marked";
import { initFormationSessions } from "./formationSessions";

type Kind = "article" | "formation" | "session";
const TABLE: Record<Kind, string> = { article: "posts", formation: "formations", session: "sessions" };
const HTMLCOL: Record<Kind, string> = { article: "body_html", formation: "description_html", session: "description_html" };
const MDCOL: Record<Kind, string | null> = { article: "body_md", formation: "description_md", session: null };

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T | null;
const val = (id: string) => ($(id) as HTMLInputElement | null)?.value ?? "";
const setVal = (id: string, v: any) => { const el = $(id) as HTMLInputElement | null; if (el) el.value = v ?? ""; };
const mdToHtml = (md: string) => (md ? (marked.parse(md) as string) : "");
const BADGES: [string, string][] = [["", "— Aucun —"], ["hot", "Forte demande"], ["limited", "Places limitées"], ["ok", "Avantageux"], ["popular", "★ Le plus choisi (ruban)"]];

export async function initEditorPage() {
  const root = $("ed-root") as HTMLElement | null;
  if (!root) return;
  const type = root.dataset.type as Kind;
  let id = root.dataset.id || "";
  const base = root.dataset.base || "/";

  const { data: { session } } = await supabaseBrowser.auth.getSession();
  if (!session) return; // le layout gère la redirection

  let status = type === "formation" ? "published" : "draft";
  let slugTouched = false;
  let dirty = false;
  let saving = false;
  let handle: EditorHandle;
  let originalTtIds: string[] = [];

  const titleEl = $("ed-title") as HTMLTextAreaElement;
  const autostate = $("ed-autostate") as HTMLElement;

  /* ---------- Chargement de l'enregistrement ---------- */
  let record: any = null;
  if (id) {
    const sel = type === "session"
      ? "*, ticket_types(id,name,price,compare_at_price,capacity,sold,badge,sales_end,sort)"
      : "*";
    const { data, error } = await supabaseBrowser.from(TABLE[type]).select(sel).eq("id", id).maybeSingle();
    if (error || !data) { toast("Enregistrement introuvable.", "err"); }
    else record = data;
  }

  /* ---------- Formations (pour le select de session) ---------- */
  let ttOptions: { id: string; label: string }[] = [];
  let originalBumpIds: string[] = [];
  if (type === "session") {
    const { data: fs } = await supabaseBrowser.from("formations").select("id,title,theme").order("title");
    const sel = $("f-formation") as HTMLSelectElement | null;
    if (sel) sel.innerHTML = '<option value="">— Aucune —</option>' +
      (fs || []).map((f: any) => `<option value="${f.id}">${esc(f.title)}</option>`).join("");

    // Tarifs des AUTRES sessions (cibles possibles d'un order bump).
    const { data: tts } = await supabaseBrowser
      .from("ticket_types")
      .select("id,name,price,session_id,sessions(title,starts_at)")
      .order("name");
    ttOptions = (tts || [])
      .filter((t: any) => t.session_id !== id)
      .map((t: any) => ({ id: t.id, label: `${(t.sessions?.title || "Session")} — ${t.name} (${(t.price ?? 0).toLocaleString("fr-FR")} F)` }));

    // Order bumps existants de cette session.
    if (id) {
      const { data: obs } = await supabaseBrowser
        .from("order_bumps").select("*").eq("session_id", id).order("sort");
      originalBumpIds = (obs || []).map((o: any) => o.id);
      (obs || []).forEach((o: any) => addObRow(o));
    }
  }

  /* ---------- Thèmes (liste partagée, réutilisable) ---------- */
  const { data: themesData } = await supabaseBrowser
    .from("themes").select("id,name,slug,color").order("sort_order").order("name");
  const themes: any[] = themesData || [];
  const themeSelId = type === "article" ? "f-category" : "f-theme";
  function fillThemeSelect(selectedId: string) {
    const el = $(themeSelId) as HTMLSelectElement | null;
    if (!el) return;
    el.innerHTML = '<option value="">— Aucun —</option>' +
      themes.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
    el.value = selectedId || "";
  }
  const selectedTheme = () => {
    const tid = val(themeSelId) || null;
    const t = themes.find((x) => x.id === tid);
    return { theme_id: (tid || null) as string | null, name: (t?.name ?? null) as string | null };
  };
  fillThemeSelect(record?.theme_id || "");

  /* ---------- Pré-remplissage des champs ---------- */
  if (record) {
    titleEl.value = record.title || "";
    setVal("f-slug", record.slug || "");
    slugTouched = !!record.slug;
    if (type !== "formation") status = record.status || "draft";

    if (type === "article") {
      setVal("f-author", record.author || "Équipe Bweb");
      setVal("f-reading", record.reading_minutes || "");
      setVal("f-excerpt", record.excerpt || "");
      setVal("f-cover", record.cover_url || "");
      setVal("f-seotitle", record.seo_title || "");
      setVal("f-seodesc", record.seo_description || "");
      setVal("f-focus", record.focus_keyword || "");
      setVal("f-pubdate", record.published_at ? dtLocalValue(record.published_at) : "");
    } else if (type === "formation") {
      setVal("f-level", record.level || "");
      setVal("f-duration", record.duration || "");
      setVal("f-price", record.default_price ?? "");
      setVal("f-summary", record.summary || "");
      setVal("f-instructor", record.instructor_name || "");
      setVal("f-instructor-role", record.instructor_role || "");
      setVal("f-instructor-photo", record.instructor_photo_url || "");
      setVal("f-instructor-bio", record.instructor_bio || "");
      setVal("f-audience", record.audience || "");
      setVal("f-prerequis", record.prerequisites || "");
      setVal("f-included", record.included_extra || "");
      setVal("f-image", record.image_url || "");
      setVal("f-seotitle", record.seo_title || "");
      setVal("f-seodesc", record.seo_description || "");
      setVal("f-focus", record.focus_keyword || "");
    } else {
      setVal("f-formation", record.formation_id || "");
      setVal("f-level", record.level || "");
      setVal("f-mode", record.mode || "presentiel");
      setVal("f-start", record.starts_at ? dtLocalValue(record.starts_at) : "");
      setVal("f-end", record.ends_at ? dtLocalValue(record.ends_at) : "");
      setVal("f-city", record.city || "Abidjan");
      setVal("f-venue", record.venue || "Espace de formation Bweb · Cocody");
      setVal("f-address", record.address || "");
      setVal("f-meeting-url", record.meeting_url || "");
      setVal("f-meeting-info", record.meeting_info || "");
      setVal("f-image", record.image_url || "");
      setVal("f-seotitle", record.seo_title || "");
      setVal("f-seodesc", record.seo_description || "");
      setVal("f-focus", record.focus_keyword || "");
      originalTtIds = (record.ticket_types || []).map((t: any) => t.id);
      (record.ticket_types || []).sort((a: any, b: any) => a.sort - b.sort).forEach((t: any) => addTtRow(t));
    }
  }

  /* ---------- Montage de l'éditeur ---------- */
  const initialHtml = record
    ? (record[HTMLCOL[type]] || (MDCOL[type] ? mdToHtml(record[MDCOL[type] as string]) : ""))
    : "";
  handle = mountEditor({
    element: $("ed-editor") as HTMLElement,
    toolbar: $("ed-toolbar") as HTMLElement,
    content: initialHtml,
    placeholder: type === "article" ? "Racontez votre article, ou tapez « / »…" : "Décrivez le contenu, ou tapez « / »…",
    uploadImage: (f) => uploadMedia(f, type),
    onChange: markDirty,
  });

  /* ---------- Éléments d'UI communs ---------- */
  updateCrumb(); updatePill(); updatePreview(); autoGrow(); updateMeta(); renderSeo();
  if (type === "session") setupModeToggle();
  if (type === "formation") { setupFormationTabs(); initFormationSessions(root, id, { theme: selectedTheme().name, theme_id: selectedTheme().theme_id }); }

  titleEl.addEventListener("input", () => {
    autoGrow();
    if (!slugTouched && !id) { setVal("f-slug", slugify(titleEl.value)); updatePreview(); }
    markDirty();
  });
  $("f-slug")?.addEventListener("input", () => { slugTouched = true; updatePreview(); markDirty(); });
  root.querySelectorAll<HTMLElement>(".ed-inp, .ed-ta, .ed-sel").forEach((el) =>
    el.addEventListener("input", markDirty));

  // Statut (segmented)
  root.querySelectorAll<HTMLElement>("#ed-status [data-status]").forEach((b) =>
    b.addEventListener("click", () => { setStatus(b.dataset.status!); markDirty(); }));

  $("ed-save")?.addEventListener("click", () => save(false));
  $("ed-publish")?.addEventListener("click", () => { setStatus("published"); save(false); });

  // Tarifs (session)
  $("ed-tt-add")?.addEventListener("click", () => addTtRow(null));
  // Order bumps (session) — 2 max
  $("ed-ob-add")?.addEventListener("click", () => {
    const list = $("ed-ob-list");
    if (list && list.querySelectorAll(".ed-tt").length >= 2) { toast("2 order bumps maximum.", "err"); return; }
    addObRow(null);
  });

  // Couverture / visuel
  setupCover();

  // Raccourci ⌘/Ctrl+S
  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(false); }
  });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ============================================================= */
  function autoGrow() { titleEl.style.height = "auto"; titleEl.style.height = titleEl.scrollHeight + "px"; }

  function updateCrumb() {
    const c = $("ed-crumb-doc"); if (c) c.textContent = titleEl.value.trim() || c.textContent || "Sans titre";
  }
  function setStatus(s: string) {
    status = s;
    root.querySelectorAll<HTMLElement>("#ed-status [data-status]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.status === s)));
    updatePill();
  }
  function updatePill() {
    const pill = $("ed-status-pill"); if (!pill) return;
    const label = { draft: "Brouillon", published: "Publié", full: "Complète", cancelled: "Annulée" }[status] || status;
    pill.lastChild!.textContent = label;
    pill.className = "ed-status-pill " + (status === "published" ? "ok" : status === "cancelled" ? "off" : "draft");
    setStatusButtons();
  }
  function setStatusButtons() {
    root.querySelectorAll<HTMLElement>("#ed-status [data-status]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.status === status)));
  }
  function updatePreview() {
    const a = $("ed-preview") as HTMLAnchorElement | null; if (!a) return;
    const slug = val("f-slug");
    if (type !== "formation" && slug) { a.href = base + slug; a.hidden = false; }
    else a.hidden = true;
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  function markDirty() {
    dirty = true;
    if (autostate) autostate.textContent = "Modifications non enregistrées";
    updateCrumb(); updateMeta(); renderSeo();
    clearTimeout(saveTimer);
    if (id) saveTimer = setTimeout(() => save(true), 1600); // autosave sur enregistrement existant
  }
  function updateMeta() {
    const meta = $("ed-doc-meta"); if (!meta) return;
    const words = (handle.getHTML().replace(/<[^>]+>/g, " ").match(/\S+/g) || []).length;
    meta.textContent = words ? `${words} mot${words > 1 ? "s" : ""} · ~${Math.max(1, Math.round(words / 200))} min de lecture` : "Commencez à écrire…";
  }
  function renderSeo() {
    const badge = $("ed-seo-badge"); if (!badge) return; // panneau SEO présent seulement si activé (article/formation/session)
    const coverField = type === "article" ? "f-cover" : "f-image";
    const excerpt = type === "article" ? val("f-excerpt") : type === "formation" ? val("f-summary") : "";
    const res = analyzeSeo({
      title: titleEl.value, slug: val("f-slug"), metaTitle: val("f-seotitle"),
      metaDescription: val("f-seodesc"), excerpt, html: handle.getHTML(),
      focusKeyword: val("f-focus"), coverUrl: val(coverField),
    });
    badge.textContent = res.score + "/100";
    badge.className = "ed-seo-badge " + res.grade;
    const put = (id: string, v: string) => { const el = $(id); if (el) el.textContent = v; };
    put("seo-url", ("bwebagence.com" + base + (val("f-slug") || "…")).split("/").filter(Boolean).join(" › "));
    put("seo-title", (val("f-seotitle") || titleEl.value || "Titre de la page").slice(0, 70));
    put("seo-desc", (val("f-seodesc") || excerpt || "Ajoutez une description méta pour l'aperçu Google…").slice(0, 170));
    put("seo-title-count", (val("f-seotitle") || titleEl.value).length + " / 60 caractères conseillés");
    put("seo-desc-count", (val("f-seodesc") || excerpt).length + " / 156 caractères conseillés");
    const list = $("ed-seo-checks");
    if (list) list.innerHTML = res.checks
      .map((c) => `<div class="ed-seo-check ${c.status}"><span class="dot"></span><span>${esc(c.label)}</span></div>`).join("");
  }
  function setSaved() {
    dirty = false;
    if (autostate) autostate.textContent = "Enregistré à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  /* ---------- Tarifs (session) ---------- */
  function addTtRow(tt: any) {
    const list = $("ed-tt-list"); if (!list) return;
    const div = document.createElement("div");
    div.className = "ed-tt";
    div.dataset.ttId = tt?.id || "";
    div.innerHTML = `
      <div class="ed-tt-head"><span>${tt ? "Vendus : " + tt.sold : "Nouveau tarif"}</span>
        <button type="button" class="ed-tt-del" title="Retirer">✕</button></div>
      <input class="ed-inp" data-tt-name placeholder="Nom du tarif" value="${esc(tt?.name || "")}" />
      <div class="ed-row2" style="margin-top:8px">
        <input class="ed-inp" data-tt-price type="number" min="0" placeholder="Prix FCFA" value="${tt?.price ?? ""}" />
        <input class="ed-inp" data-tt-compare type="number" min="0" placeholder="Prix barré (promo, optionnel)" title="Prix normal affiché barré ; doit être supérieur au prix" value="${tt?.compare_at_price ?? ""}" />
      </div>
      <div class="ed-row2" style="margin-top:8px">
        <input class="ed-inp" data-tt-cap type="number" min="0" placeholder="Places" value="${tt?.capacity ?? ""}" />
      </div>
      <div class="ed-row2" style="margin-top:8px">
        <select class="ed-sel" data-tt-badge>${BADGES.map(([v, l]) => `<option value="${v}" ${tt?.badge === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <input class="ed-inp" data-tt-end type="datetime-local" title="Fin de validité" value="${tt?.sales_end ? dtLocalValue(tt.sales_end) : ""}" />
      </div>`;
    div.querySelector(".ed-tt-del")!.addEventListener("click", () => { div.remove(); markDirty(); });
    div.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", markDirty));
    list.appendChild(div);
  }
  async function syncTickets(sessionId: string) {
    const items = Array.from(($("ed-tt-list") as HTMLElement).querySelectorAll<HTMLElement>(".ed-tt"));
    const keptIds: string[] = [];
    let sort = 0;
    for (const it of items) {
      const name = (it.querySelector("[data-tt-name]") as HTMLInputElement).value.trim();
      if (!name) continue;
      const payload: any = {
        session_id: sessionId, name,
        price: parseInt((it.querySelector("[data-tt-price]") as HTMLInputElement).value || "0"),
        compare_at_price: (it.querySelector("[data-tt-compare]") as HTMLInputElement).value
          ? parseInt((it.querySelector("[data-tt-compare]") as HTMLInputElement).value) : null,
        capacity: parseInt((it.querySelector("[data-tt-cap]") as HTMLInputElement).value || "0"),
        badge: (it.querySelector("[data-tt-badge]") as HTMLSelectElement).value || null,
        sales_end: (it.querySelector("[data-tt-end]") as HTMLInputElement).value
          ? new Date((it.querySelector("[data-tt-end]") as HTMLInputElement).value).toISOString() : null,
        sort: sort++,
      };
      const ttId = it.dataset.ttId;
      if (ttId) { keptIds.push(ttId); const { error } = await supabaseBrowser.from("ticket_types").update(payload).eq("id", ttId); if (error) throw error; }
      else { const { data, error } = await supabaseBrowser.from("ticket_types").insert(payload).select("id").single(); if (error) throw error; it.dataset.ttId = data.id; keptIds.push(data.id); }
    }
    const toDelete = originalTtIds.filter((x) => !keptIds.includes(x));
    if (toDelete.length) { const { error } = await supabaseBrowser.from("ticket_types").delete().in("id", toDelete); if (error) throw error; }
    originalTtIds = keptIds;
  }

  /* ---------- Order bumps (session) ---------- */
  function addObRow(ob: any) {
    const list = $("ed-ob-list"); if (!list) return;
    const opts = '<option value="">— Choisir un tarif à ajouter —</option>' +
      ttOptions.map((o) => `<option value="${o.id}" ${ob?.ticket_type_id === o.id ? "selected" : ""}>${esc(o.label)}</option>`).join("");
    const div = document.createElement("div");
    div.className = "ed-tt";
    div.dataset.obId = ob?.id || "";
    div.innerHTML = `
      <div class="ed-tt-head"><span>Order bump</span>
        <button type="button" class="ed-tt-del" title="Retirer">✕</button></div>
      <select class="ed-sel" data-ob-tt>${opts}</select>
      <div class="ed-help" style="margin-top:6px">Le <b>titre affiché</b> = le nom de la formation choisie ci-dessus.</div>
      <input class="ed-inp" data-ob-badge placeholder="Badge (ex. Recommandé, −20 %)" value="${esc(ob?.badge || "")}" style="margin-top:8px" />
      <input class="ed-inp" data-ob-headline placeholder="Petite accroche au-dessus du titre (optionnel, ex. Complétez votre parcours)" value="${esc(ob?.headline || "")}" style="margin-top:8px" />
      <textarea class="ed-ta" data-ob-desc rows="3" placeholder="Description vendeuse : bénéfices concrets + pourquoi la prendre maintenant…" style="margin-top:8px">${esc(ob?.description || "")}</textarea>`;
    div.querySelector(".ed-tt-del")!.addEventListener("click", () => { div.remove(); markDirty(); });
    div.querySelectorAll("input,select,textarea").forEach((el) => el.addEventListener("input", markDirty));
    list.appendChild(div);
  }
  async function syncBumps(sessionId: string) {
    const listEl = $("ed-ob-list"); if (!listEl) return;
    const items = Array.from(listEl.querySelectorAll<HTMLElement>(".ed-tt"));
    const keptIds: string[] = [];
    let sort = 0;
    for (const it of items) {
      const ttId = (it.querySelector("[data-ob-tt]") as HTMLSelectElement).value;
      if (!ttId) continue; // ligne incomplète → ignorée
      const payload: any = {
        session_id: sessionId,
        ticket_type_id: ttId,
        headline: (it.querySelector("[data-ob-headline]") as HTMLInputElement).value.trim() || null,
        description: (it.querySelector("[data-ob-desc]") as HTMLTextAreaElement).value.trim() || null,
        badge: (it.querySelector("[data-ob-badge]") as HTMLInputElement).value.trim() || null,
        sort: sort++,
      };
      const obId = it.dataset.obId;
      if (obId) { keptIds.push(obId); const { error } = await supabaseBrowser.from("order_bumps").update(payload).eq("id", obId); if (error) throw error; }
      else { const { data, error } = await supabaseBrowser.from("order_bumps").insert(payload).select("id").single(); if (error) throw error; it.dataset.obId = data.id; keptIds.push(data.id); }
    }
    const toDelete = originalBumpIds.filter((x) => !keptIds.includes(x));
    if (toDelete.length) { const { error } = await supabaseBrowser.from("order_bumps").delete().in("id", toDelete); if (error) throw error; }
    originalBumpIds = keptIds;
  }

  /* ---------- Mode présentiel / en ligne (session) ---------- */
  function setupModeToggle() {
    const sel = $("f-mode") as HTMLSelectElement | null;
    if (!sel) return;
    const apply = () => {
      const v = sel.value; // 'presentiel' | 'en_ligne' | 'hybride'
      // Hybride → on montre les deux panneaux (présentiel ET en ligne).
      root.querySelectorAll<HTMLElement>("[data-mode-presentiel]").forEach((el) => { el.hidden = v === "en_ligne"; });
      root.querySelectorAll<HTMLElement>("[data-mode-enligne]").forEach((el) => { el.hidden = v === "presentiel"; });
    };
    sel.addEventListener("change", () => { apply(); markDirty(); });
    apply();
  }

  /* ---------- Onglets Détails / Sessions (formation) ---------- */
  function setupFormationTabs() {
    const tabs = Array.from(root.querySelectorAll<HTMLElement>(".ed-ftab"));
    const panes = Array.from(root.querySelectorAll<HTMLElement>("[data-ftab-pane]"));
    if (!tabs.length) return;
    tabs.forEach((tab) => tab.addEventListener("click", () => {
      const target = tab.dataset.ftab;
      tabs.forEach((x) => { const on = x.dataset.ftab === target; x.classList.toggle("is-active", on); x.setAttribute("aria-selected", String(on)); });
      panes.forEach((p) => { p.hidden = p.dataset.ftabPane !== target; });
    }));
  }

  /* ---------- Couverture / visuel ---------- */
  function setupCover() {
    const box = $("ed-cover") as HTMLElement | null; if (!box) return;
    const targetId = box.dataset.target!;
    const draw = () => {
      const url = val(targetId);
      box.innerHTML = url
        ? `<div class="ed-cover-thumb"><img src="${esc(url)}" alt="" /><button type="button" class="ed-cover-rm">Retirer</button></div>`
        : `<div class="ed-cover-drop"><span class="em">🖼</span><span class="t">Déposer ou choisir une image</span><span class="s">JPG/PNG · 5 Mo max · 16/9 conseillé</span></div>`;
      if (url) box.querySelector(".ed-cover-rm")!.addEventListener("click", (e) => { e.stopPropagation(); setVal(targetId, ""); draw(); markDirty(); });
    };
    const pick = async () => {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
      inp.onchange = async () => {
        const f = inp.files?.[0]; if (!f) return;
        box.classList.add("busy");
        const url = await uploadMedia(f, type + "-cover");
        box.classList.remove("busy");
        if (url) { setVal(targetId, url); draw(); markDirty(); }
      };
      inp.click();
    };
    box.addEventListener("click", (e) => { if (!(e.target as HTMLElement).closest(".ed-cover-rm")) pick(); });
    box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("over"); });
    box.addEventListener("dragleave", () => box.classList.remove("over"));
    box.addEventListener("drop", async (e) => {
      e.preventDefault(); box.classList.remove("over");
      const f = (e as DragEvent).dataTransfer?.files?.[0];
      if (f && f.type.startsWith("image/")) { box.classList.add("busy"); const url = await uploadMedia(f, type + "-cover"); box.classList.remove("busy"); if (url) { setVal(targetId, url); draw(); markDirty(); } }
    });
    draw();
  }

  /* ---------- Sauvegarde ---------- */
  async function save(silent: boolean) {
    if (saving) return;
    const title = titleEl.value.trim();
    let slug = val("f-slug").trim() || slugify(title);
    if (!title) { if (!silent) toast("Le titre est obligatoire.", "err"); return; }
    if (!slug) { if (!silent) toast("Le slug est obligatoire.", "err"); return; }
    if (type === "session" && !val("f-start")) { if (!silent) toast("La date de début est obligatoire.", "err"); return; }

    const html = handle.getHTML();
    const payload: any = { title, slug };
    payload[HTMLCOL[type]] = html || null;
    // Thème : on enregistre la liaison (theme_id) ET le nom texte (colonne historique
    // encore lue par certaines pages publiques) pour rester cohérent pendant la bascule.
    const th = selectedTheme();

    if (type === "article") {
      let publishedAt = val("f-pubdate") ? new Date(val("f-pubdate")).toISOString() : (record?.published_at || null);
      if (status === "published" && !publishedAt) publishedAt = new Date().toISOString();
      Object.assign(payload, {
        category: th.name,
        theme_id: th.theme_id,
        author: val("f-author").trim() || "Équipe Bweb",
        reading_minutes: val("f-reading") ? parseInt(val("f-reading")) : estimateReading(html),
        excerpt: val("f-excerpt").trim() || null,
        cover_url: val("f-cover").trim() || null,
        seo_title: val("f-seotitle").trim() || null,
        seo_description: val("f-seodesc").trim() || null,
        focus_keyword: val("f-focus").trim() || null,
        status, published_at: publishedAt,
      });
    } else if (type === "formation") {
      Object.assign(payload, {
        theme: th.name,
        theme_id: th.theme_id,
        level: val("f-level").trim() || null,
        duration: val("f-duration").trim() || null,
        default_price: val("f-price") ? parseInt(val("f-price")) : null,
        summary: val("f-summary").trim() || null,
        instructor_name: val("f-instructor").trim() || null,
        instructor_role: val("f-instructor-role").trim() || null,
        instructor_photo_url: val("f-instructor-photo").trim() || null,
        instructor_bio: val("f-instructor-bio").trim() || null,
        audience: val("f-audience").trim() || null,
        prerequisites: val("f-prerequis").trim() || null,
        included_extra: val("f-included").trim() || null,
        image_url: val("f-image").trim() || null,
        seo_title: val("f-seotitle").trim() || null,
        seo_description: val("f-seodesc").trim() || null,
        focus_keyword: val("f-focus").trim() || null,
      });
    } else {
      Object.assign(payload, {
        formation_id: val("f-formation") || null,
        theme: th.name,
        theme_id: th.theme_id,
        level: val("f-level") || null,
        mode: val("f-mode") || "presentiel",
        starts_at: new Date(val("f-start")).toISOString(),
        ends_at: val("f-end") ? new Date(val("f-end")).toISOString() : null,
        city: val("f-city").trim() || null,
        venue: val("f-venue").trim() || null,
        address: val("f-address").trim() || null,
        meeting_url: val("f-meeting-url").trim() || null,
        meeting_info: val("f-meeting-info").trim() || null,
        image_url: val("f-image").trim() || null,
        seo_title: val("f-seotitle").trim() || null,
        seo_description: val("f-seodesc").trim() || null,
        focus_keyword: val("f-focus").trim() || null,
        status,
      });
    }

    saving = true; clearTimeout(saveTimer);
    const saveBtn = $("ed-save"); const pubBtn = $("ed-publish");
    saveBtn?.setAttribute("disabled", "true");
    if (!silent && saveBtn) saveBtn.textContent = "Enregistrement…";
    if (autostate) autostate.textContent = "Enregistrement…";

    try {
      if (id) {
        const { error } = await supabaseBrowser.from(TABLE[type]).update(payload).eq("id", id); if (error) throw error;
      } else {
        const { data, error } = await supabaseBrowser.from(TABLE[type]).insert(payload).select("id").single(); if (error) throw error;
        id = data.id; root.dataset.id = id;
        history.replaceState(null, "", `/admin/editeur/${type}/${id}`);
        if (type === "formation") initFormationSessions(root, id, { theme: selectedTheme().name, theme_id: selectedTheme().theme_id });
      }
      if (type === "session") { await syncTickets(id); await syncBumps(id); }
      setSaved();
      updatePreview();
      if (!silent) toast(record ? "Modifications enregistrées." : "Créé avec succès. ✅");
      record = record || {};
    } catch (e: any) {
      const m = String(e?.message || "");
      const msg = m.includes("duplicate") ? "Ce slug existe déjà — choisissez-en un autre."
        : m.includes("ticket_sold_within_capacity") ? "Le quota ne peut pas être inférieur au nombre déjà vendu."
        : m.includes("ticket_compare_gte_price") ? "Le prix barré doit être supérieur (ou égal) au prix de vente."
        : m.includes("restrict") ? "Un tarif avec réservations ne peut pas être retiré."
        : "Enregistrement impossible.";
      toast(msg, "err");
      if (autostate) autostate.textContent = "Échec de l'enregistrement";
    } finally {
      saving = false;
      saveBtn?.removeAttribute("disabled");
      if (saveBtn) saveBtn.textContent = "Enregistrer";
      if (pubBtn) pubBtn.textContent = "Publier";
    }
  }
}

function estimateReading(html: string): number {
  const text = (html || "").replace(/<[^>]+>/g, " ");
  const words = (text.match(/\S+/g) || []).length;
  return Math.max(1, Math.round(words / 200));
}
