/* =========================================================
   BWEB — Édition imbriquée des sessions dans la fiche formation.
   Chaque session = une "carte" repliable et éditable (format, dates,
   lieu/visio, tarifs, order bumps) enregistrable indépendamment.
   Le contenu rédactionnel + SEO + affiche restent dans l'éditeur détaillé.
   ========================================================= */
import { supabaseBrowser } from "../lib/supabaseBrowser";
import { slugify, dtLocalValue, toast, esc } from "./adminUtils";

const BADGES: [string, string][] = [
  ["", "— Aucun badge —"], ["hot", "Forte demande"], ["limited", "Places limitées"],
  ["ok", "Avantageux"], ["popular", "★ Le plus choisi (ruban)"],
];
const MODES: [string, string][] = [
  ["presentiel", "Présentiel"], ["en_ligne", "En ligne (visio)"], ["hybride", "Les deux (présentiel + en ligne)"],
];
const STATUSES: [string, string][] = [
  ["draft", "Brouillon"], ["published", "Publiée"], ["full", "Complète"], ["cancelled", "Annulée"],
];

type TtOption = { id: string; sessionId: string; label: string };

export async function initFormationSessions(
  root: HTMLElement,
  formationId: string,
  defaults: { theme?: string | null; theme_id?: string | null; title?: string },
) {
  const listEl = root.querySelector<HTMLElement>("#ed-fsessions-inline");
  const addBtn = root.querySelector<HTMLButtonElement>("#ed-fsession-add");
  if (!listEl) return;

  if (!formationId) {
    listEl.innerHTML = '<div class="ed-help">Enregistrez d’abord la formation (bouton « Enregistrer » en haut) pour lui ajouter des dates.</div>';
    addBtn?.setAttribute("hidden", "");
    return;
  }
  addBtn?.removeAttribute("hidden");

  // Tarifs de toutes les sessions (cibles possibles des order bumps).
  const { data: tts } = await supabaseBrowser
    .from("ticket_types")
    .select("id,name,price,session_id,sessions(title)")
    .order("name");
  const allTtOptions: TtOption[] = (tts || []).map((t: any) => ({
    id: t.id,
    sessionId: t.session_id,
    label: `${t.sessions?.title || "Session"} — ${t.name} (${(t.price ?? 0).toLocaleString("fr-FR")} F)`,
  }));

  // Sessions de cette formation (avec tarifs + order bumps imbriqués).
  const { data: sessions } = await supabaseBrowser
    .from("sessions")
    .select("*, ticket_types(id,name,price,compare_at_price,capacity,sold,badge,sales_end,sort), order_bumps(id,ticket_type_id,headline,description,badge,sort)")
    .eq("formation_id", formationId)
    .order("starts_at", { ascending: false });

  listEl.innerHTML = "";
  const list = sessions || [];
  if (!list.length) {
    listEl.insertAdjacentHTML("beforeend",
      '<div class="ed-help" data-empty>Aucune date pour cette formation. Cliquez sur « + Ajouter une date ».</div>');
  }
  // Existantes : repliées par défaut (liste compacte).
  list.forEach((s: any) => listEl.appendChild(buildCard(s, true)));

  addBtn?.addEventListener("click", () => {
    listEl.querySelector("[data-empty]")?.remove();
    const card = buildCard(null, false); // nouvelle date : dépliée
    listEl.appendChild(card);
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.querySelector<HTMLInputElement>('[data-field="title"]')?.focus();
  });

  /* ---------------- Construction d'une carte session ---------------- */
  function buildCard(s: any | null, collapsed: boolean): HTMLElement {
    let sessionId: string = s?.id || "";
    let originalTtIds: string[] = (s?.ticket_types || []).map((t: any) => t.id).filter(Boolean);
    let originalObIds: string[] = (s?.order_bumps || []).map((o: any) => o.id).filter(Boolean);

    const cap = (s?.ticket_types || []).reduce((a: number, t: any) => a + (t.capacity || 0), 0);
    const sold = (s?.ticket_types || []).reduce((a: number, t: any) => a + (t.sold || 0), 0);
    const dateLabel = s?.starts_at
      ? new Date(s.starts_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
      : "Nouvelle date";
    const subLabel = s ? `${dateLabel}${cap ? ` · ${sold}/${cap}` : ""}` : "à compléter";

    const card = document.createElement("div");
    card.className = "ed-fscard";
    card.style.cssText = "border:1px solid var(--ed-line,#e5e7eb);border-radius:10px;margin-bottom:10px;overflow:hidden;background:var(--ed-panel,#fff)";

    const optionTags = (opts: [string, string][], sel: string) =>
      opts.map(([v, l]) => `<option value="${v}"${v === sel ? " selected" : ""}>${l}</option>`).join("");
    const rowBox = "background:var(--ed-subtle,#f5f6f8);border-radius:8px;padding:8px;margin-bottom:8px";

    card.innerHTML = `
      <div class="ed-fscard-head" style="display:flex;align-items:center">
        <button type="button" data-act="toggle"
          style="flex:1;min-width:0;display:flex;gap:8px;align-items:center;text-align:left;border:0;background:transparent;padding:11px 12px;cursor:pointer;font:inherit">
          <span data-chevron style="transition:transform .15s;transform:rotate(${collapsed ? -90 : 0}deg);opacity:.6">▾</span>
          <span style="flex:1;min-width:0">
            <strong data-summary style="display:block;font-size:.86rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s?.title || dateLabel)}</strong>
            <span data-sub style="font-size:.72rem;opacity:.6">${esc(subLabel)}</span>
          </span>
        </button>
        <button type="button" class="ed-fscard-dup" data-act="duplicate" title="Dupliquer cette date"
          aria-label="Dupliquer cette date"
          style="border:0;background:transparent;cursor:pointer;padding:9px 12px;opacity:.55;font-size:1.05rem;line-height:1" ${sessionId ? "" : "hidden"}>⧉</button>
      </div>
      <div class="ed-fscard-body" style="padding:0 12px 12px" ${collapsed ? "hidden" : ""}>
        <div class="ed-row2">
          <div class="ed-field"><label>Format</label><select class="ed-sel" data-field="mode">${optionTags(MODES, s?.mode || "presentiel")}</select></div>
          <div class="ed-field"><label>Statut</label><select class="ed-sel" data-field="status">${optionTags(STATUSES, s?.status || "draft")}</select></div>
        </div>
        <div class="ed-field"><label>Titre de la date</label>
          <input class="ed-inp" data-field="title" placeholder="Ex. IA · Abidjan · 29 juillet" value="${esc(s?.title || "")}" /></div>
        <div class="ed-field"><label>Début *</label><input class="ed-inp" data-field="start" type="datetime-local" value="${s?.starts_at ? dtLocalValue(s.starts_at) : ""}" /></div>
        <div class="ed-field"><label>Fin</label><input class="ed-inp" data-field="end" type="datetime-local" value="${s?.ends_at ? dtLocalValue(s.ends_at) : ""}" /></div>
        <div data-mode-presentiel>
          <div class="ed-row2">
            <div class="ed-field"><label>Ville</label><input class="ed-inp" data-field="city" value="${esc(s?.city ?? "Abidjan")}" /></div>
            <div class="ed-field"><label>Lieu</label><input class="ed-inp" data-field="venue" value="${esc(s?.venue ?? "Espace de formation Bweb · Cocody")}" /></div>
          </div>
          <div class="ed-field"><label>Adresse / accès (optionnel)</label><input class="ed-inp" data-field="address" value="${esc(s?.address || "")}" /></div>
        </div>
        <div data-mode-enligne hidden>
          <div class="ed-field"><label>Lien de connexion (visio)</label><input class="ed-inp" data-field="meeting_url" placeholder="https://meet… / zoom… / teams…" value="${esc(s?.meeting_url || "")}" /></div>
          <div class="ed-field"><label>Consignes de connexion</label><textarea class="ed-ta" data-field="meeting_info" rows="2">${esc(s?.meeting_info || "")}</textarea></div>
        </div>

        <div class="ed-fs-sub" style="font-weight:600;font-size:.8rem;margin:12px 0 6px">Tarifs / billets</div>
        <div data-tt-list></div>
        <button type="button" class="ed-addline" data-act="tt-add">+ Ajouter un tarif</button>

        <div class="ed-fs-sub" style="font-weight:600;font-size:.8rem;margin:14px 0 6px">Order bumps</div>
        <div data-ob-list></div>
        <button type="button" class="ed-addline" data-act="ob-add">+ Ajouter un order bump</button>

        <div class="ed-fscard-foot" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:10px">
          <button type="button" class="ed-btn danger" data-act="delete" style="font-size:.8rem" ${sessionId ? "" : "hidden"}>Supprimer cette date</button>
          <button type="button" class="ed-btn primary" data-act="save" style="padding:10px 18px">Enregistrer cette date</button>
        </div>
      </div>`;

    const q = <T extends HTMLElement = HTMLElement>(sel: string) => card.querySelector<T>(sel)!;
    const fieldVal = (name: string) => (card.querySelector<HTMLInputElement>(`[data-field="${name}"]`)?.value ?? "").trim();
    const body = q(".ed-fscard-body");
    const ttList = q("[data-tt-list]");
    const obList = q("[data-ob-list]");

    // Repli / dépli
    q('[data-act="toggle"]').addEventListener("click", () => {
      const isHidden = body.hasAttribute("hidden");
      if (isHidden) body.removeAttribute("hidden"); else body.setAttribute("hidden", "");
      q('[data-chevron]').style.transform = `rotate(${isHidden ? 0 : -90}deg)`;
    });

    // Résumé live (titre)
    q('[data-field="title"]').addEventListener("input", () => {
      q("[data-summary]").textContent = fieldVal("title") || dateLabel;
    });

    // Mode → afficher/masquer présentiel / en ligne
    const applyMode = () => {
      const v = fieldVal("mode");
      card.querySelector<HTMLElement>("[data-mode-presentiel]")!.hidden = v === "en_ligne";
      card.querySelector<HTMLElement>("[data-mode-enligne]")!.hidden = v === "presentiel";
    };
    q('[data-field="mode"]').addEventListener("change", applyMode);
    applyMode();

    // Tarifs
    (s?.ticket_types || []).slice().sort((a: any, b: any) => a.sort - b.sort).forEach((t: any) => ttList.appendChild(ttRow(t)));
    q('[data-act="tt-add"]').addEventListener("click", () => ttList.appendChild(ttRow(null)));

    // Order bumps
    (s?.order_bumps || []).slice().sort((a: any, b: any) => a.sort - b.sort).forEach((o: any) => obList.appendChild(obRow(o)));
    q('[data-act="ob-add"]').addEventListener("click", () => {
      if (obList.querySelectorAll("[data-ob]").length >= 2) { toast("2 order bumps maximum.", "err"); return; }
      obList.appendChild(obRow(null));
    });

    q('[data-act="save"]').addEventListener("click", () => saveCard());
    q('[data-act="delete"]').addEventListener("click", () => deleteCard());
    q('[data-act="duplicate"]').addEventListener("click", () => duplicateCard());

    return card;

    /* ----- lignes tarif / order bump (fond doux, sans bordure) ----- */
    function ttRow(t: any): HTMLElement {
      const div = document.createElement("div");
      div.dataset.tt = "";
      div.dataset.ttId = t?.id || "";
      div.style.cssText = rowBox;
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:.78rem;opacity:.7">${t ? "Vendus : " + (t.sold ?? 0) : "Nouveau tarif"}</span>
          <button type="button" data-tt-del title="Retirer ce tarif" aria-label="Retirer ce tarif" style="border:0;background:transparent;cursor:pointer;color:var(--c-danger);font-weight:700">✕</button></div>
        <input class="ed-inp" data-tt-name placeholder="Nom du tarif" value="${esc(t?.name || "")}" />
        <div class="ed-row2" style="margin-top:8px">
          <input class="ed-inp" data-tt-price type="number" min="0" placeholder="Prix FCFA" value="${t?.price ?? ""}" />
          <input class="ed-inp" data-tt-compare type="number" min="0" placeholder="Prix barré (promo)" value="${t?.compare_at_price ?? ""}" />
        </div>
        <input class="ed-inp" data-tt-cap type="number" min="0" placeholder="Places (capacité)" value="${t?.capacity ?? ""}" style="margin-top:8px" />
        <div class="ed-row2" style="margin-top:8px">
          <select class="ed-sel" data-tt-badge>${BADGES.map(([v, l]) => `<option value="${v}"${t?.badge === v ? " selected" : ""}>${l}</option>`).join("")}</select>
          <input class="ed-inp" data-tt-end type="datetime-local" title="Fin de validité du tarif" value="${t?.sales_end ? dtLocalValue(t.sales_end) : ""}" />
        </div>`;
      div.querySelector("[data-tt-del]")!.addEventListener("click", () => div.remove());
      return div;
    }

    function obRow(o: any): HTMLElement {
      const opts = '<option value="">— Choisir un tarif à ajouter —</option>' +
        allTtOptions.filter((x) => x.sessionId !== sessionId)
          .map((x) => `<option value="${x.id}"${o?.ticket_type_id === x.id ? " selected" : ""}>${esc(x.label)}</option>`).join("");
      const div = document.createElement("div");
      div.dataset.ob = "";
      div.dataset.obId = o?.id || "";
      div.style.cssText = rowBox;
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:.78rem;opacity:.7">Order bump</span>
          <button type="button" data-ob-del title="Retirer cet order bump" aria-label="Retirer cet order bump" style="border:0;background:transparent;cursor:pointer;color:var(--c-danger);font-weight:700">✕</button></div>
        <select class="ed-sel" data-ob-tt>${opts}</select>
        <input class="ed-inp" data-ob-badge placeholder="Badge (ex. Recommandé)" value="${esc(o?.badge || "")}" style="margin-top:8px" />
        <input class="ed-inp" data-ob-headline placeholder="Accroche (optionnel)" value="${esc(o?.headline || "")}" style="margin-top:8px" />
        <textarea class="ed-ta" data-ob-desc rows="2" placeholder="Description vendeuse…" style="margin-top:8px">${esc(o?.description || "")}</textarea>`;
      div.querySelector("[data-ob-del]")!.addEventListener("click", () => div.remove());
      return div;
    }

    /* ----- enregistrement d'une carte ----- */
    async function saveCard() {
      const title = fieldVal("title");
      const start = fieldVal("start");
      if (!title) { toast("Le titre de la date est obligatoire.", "err"); return; }
      if (!start) { toast("La date de début est obligatoire.", "err"); return; }

      const saveBtn = q<HTMLButtonElement>('[data-act="save"]');
      saveBtn.setAttribute("disabled", "true"); saveBtn.textContent = "Enregistrement…";
      try {
        const fields: any = {
          formation_id: formationId,
          title,
          status: fieldVal("status") || "draft",
          mode: fieldVal("mode") || "presentiel",
          starts_at: new Date(start).toISOString(),
          ends_at: fieldVal("end") ? new Date(fieldVal("end")).toISOString() : null,
          city: fieldVal("city") || null,
          venue: fieldVal("venue") || null,
          address: fieldVal("address") || null,
          meeting_url: fieldVal("meeting_url") || null,
          meeting_info: fieldVal("meeting_info") || null,
        };

        if (sessionId) {
          const { error } = await supabaseBrowser.from("sessions").update(fields).eq("id", sessionId);
          if (error) throw error;
        } else {
          const slug = `${slugify(title)}-${start.slice(0, 10)}`;
          const { data, error } = await supabaseBrowser.from("sessions")
            .insert({ ...fields, slug, theme: defaults.theme || null, theme_id: defaults.theme_id || null })
            .select("id").single();
          if (error) throw error;
          sessionId = data.id;
        }

        await syncTickets();
        await syncBumps();

        q("[data-summary]").textContent = title;
        q('[data-act="delete"]').removeAttribute("hidden");
        card.querySelector('[data-act="duplicate"]')?.removeAttribute("hidden");
        toast("Date enregistrée. ✅");
      } catch (e: any) {
        const m = String(e?.message || "");
        toast(
          m.includes("duplicate") ? "Ce slug de session existe déjà — modifiez le titre."
          : m.includes("ticket_sold_within_capacity") ? "Le quota ne peut pas être inférieur au nombre déjà vendu."
          : m.includes("ticket_compare_gte_price") ? "Le prix barré doit être supérieur au prix de vente."
          : m.includes("restrict") ? "Un tarif avec des réservations ne peut pas être retiré."
          : "Enregistrement impossible.", "err");
      } finally {
        saveBtn.removeAttribute("disabled"); saveBtn.textContent = "Enregistrer cette date";
      }
    }

    async function syncTickets() {
      const items = Array.from(ttList.querySelectorAll<HTMLElement>("[data-tt]"));
      const kept: string[] = [];
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
        if (ttId) { kept.push(ttId); const { error } = await supabaseBrowser.from("ticket_types").update(payload).eq("id", ttId); if (error) throw error; }
        else { const { data, error } = await supabaseBrowser.from("ticket_types").insert(payload).select("id").single(); if (error) throw error; it.dataset.ttId = data.id; kept.push(data.id); }
      }
      const toDelete = originalTtIds.filter((x) => !kept.includes(x));
      if (toDelete.length) { const { error } = await supabaseBrowser.from("ticket_types").delete().in("id", toDelete); if (error) throw error; }
      originalTtIds = kept;
    }

    async function syncBumps() {
      const items = Array.from(obList.querySelectorAll<HTMLElement>("[data-ob]"));
      const kept: string[] = [];
      let sort = 0;
      for (const it of items) {
        const ttId = (it.querySelector("[data-ob-tt]") as HTMLSelectElement).value;
        if (!ttId) continue;
        const payload: any = {
          session_id: sessionId, ticket_type_id: ttId,
          headline: (it.querySelector("[data-ob-headline]") as HTMLInputElement).value.trim() || null,
          description: (it.querySelector("[data-ob-desc]") as HTMLTextAreaElement).value.trim() || null,
          badge: (it.querySelector("[data-ob-badge]") as HTMLInputElement).value.trim() || null,
          sort: sort++,
        };
        const obId = it.dataset.obId;
        if (obId) { kept.push(obId); const { error } = await supabaseBrowser.from("order_bumps").update(payload).eq("id", obId); if (error) throw error; }
        else { const { data, error } = await supabaseBrowser.from("order_bumps").insert(payload).select("id").single(); if (error) throw error; it.dataset.obId = data.id; kept.push(data.id); }
      }
      const toDelete = originalObIds.filter((x) => !kept.includes(x));
      if (toDelete.length) { const { error } = await supabaseBrowser.from("order_bumps").delete().in("id", toDelete); if (error) throw error; }
      originalObIds = kept;
    }

    /* ----- duplication : nouvelle carte pré-remplie, date à ressaisir ----- */
    function duplicateCard() {
      const src: any = s ? JSON.parse(JSON.stringify(s)) : {};
      const dup: any = {
        title: (fieldVal("title") || src.title || "") + " (copie)",
        mode: fieldVal("mode") || src.mode || "presentiel",
        status: "draft",
        starts_at: null, ends_at: null, // nouvelle date à saisir
        city: fieldVal("city") || src.city || null,
        venue: fieldVal("venue") || src.venue || null,
        address: fieldVal("address") || src.address || null,
        meeting_url: fieldVal("meeting_url") || src.meeting_url || null,
        meeting_info: fieldVal("meeting_info") || src.meeting_info || null,
        image_url: src.image_url || null,
        ticket_types: (src.ticket_types || []).map((t: any) => ({ ...t, id: undefined, sold: 0 })),
        order_bumps: (src.order_bumps || []).map((o: any) => ({ ...o, id: undefined })),
      };
      listEl!.querySelector("[data-empty]")?.remove();
      const nc = buildCard(dup, false);
      card.after(nc);
      nc.scrollIntoView({ behavior: "smooth", block: "center" });
      (nc.querySelector('[data-field="start"]') as HTMLInputElement | null)?.focus();
      toast("Date dupliquée — choisissez la nouvelle date puis « Enregistrer ».");
    }

    async function deleteCard() {
      if (!sessionId) { card.remove(); return; }
      if (!window.confirm(`Supprimer cette date « ${fieldVal("title")} » et ses tarifs ? (Impossible s'il existe des réservations.)`)) return;
      const { error } = await supabaseBrowser.from("sessions").delete().eq("id", sessionId);
      if (error) { toast("Suppression impossible (réservations existantes ?).", "err"); return; }
      toast("Date supprimée."); card.remove();
    }
  }
}
