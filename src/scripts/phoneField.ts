/* =========================================================
   BWEB AGENCE — Champ téléphone : combobox pays recherchable
   -----------------------------------------------------------
   Enrichit chaque <select name="phone_cc"> (repli sans JS) en un
   combobox : bouton (drapeau + indicatif) + panneau avec recherche
   et liste filtrable de TOUS les pays. Le <select> natif reste la
   source de valeur (lu par forms.ts). Positionnement `fixed` pour ne
   pas être rogné par le scroll de la modale. Accessible au clavier.
   ========================================================= */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const CARET =
  '<svg class="pf-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';

export function initPhoneField(): void {
  document.querySelectorAll<HTMLElement>(".phone-field[data-phone-field]").forEach((field) => {
    const select = field.querySelector<HTMLSelectElement>("select.phone-cc");
    if (!select || field.dataset.pfReady) return;
    field.dataset.pfReady = "1";

    const opts = Array.from(select.options).map((o) => ({
      value: o.value, iso: o.dataset.iso || "", dial: o.dataset.dial || "", name: o.dataset.name || "", flag: o.dataset.flag || "",
    }));

    /* ---- Construction du combobox ---- */
    const combo = document.createElement("div");
    combo.className = "pf-combo";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "pf-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Indicatif pays");
    trigger.innerHTML = `<span class="pf-flag"></span><span class="pf-code"></span>${CARET}`;

    const pop = document.createElement("div");
    pop.className = "pf-pop";
    pop.hidden = true;
    pop.innerHTML =
      `<div class="pf-search-wrap">${SEARCH_ICON}<input type="text" class="pf-search" placeholder="Rechercher un pays…" aria-label="Rechercher un pays" autocomplete="off"></div>` +
      `<ul class="pf-list" role="listbox" tabindex="-1" aria-label="Pays"></ul><p class="pf-empty" hidden>Aucun pays trouvé.</p>`;

    combo.appendChild(trigger);
    select.after(combo);
    document.body.appendChild(pop); // ancré au body : position fixed = référentiel viewport
    select.classList.add("pf-native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    const listEl = pop.querySelector<HTMLUListElement>(".pf-list")!;
    const searchEl = pop.querySelector<HTMLInputElement>(".pf-search")!;
    const emptyEl = pop.querySelector<HTMLElement>(".pf-empty")!;
    const flagEl = trigger.querySelector<HTMLElement>(".pf-flag")!;
    const codeEl = trigger.querySelector<HTMLElement>(".pf-code")!;

    opts.forEach((o, i) => {
      const li = document.createElement("li");
      li.className = "pf-opt";
      li.setAttribute("role", "option");
      li.dataset.idx = String(i);
      li.dataset.search = norm(`${o.name} ${o.dial} +${o.dial}`);
      li.innerHTML = `<span class="pf-opt-flag">${o.flag}</span><span class="pf-opt-name">${o.name}</span><span class="pf-opt-code">+${o.dial}</span>`;
      listEl.appendChild(li);
    });
    const items = Array.from(listEl.querySelectorAll<HTMLLIElement>(".pf-opt"));

    function syncTrigger(): void {
      const o = opts[select.selectedIndex] || opts[0];
      flagEl.textContent = o.flag;
      codeEl.textContent = o.value;
      items.forEach((li) => li.setAttribute("aria-selected", Number(li.dataset.idx) === select.selectedIndex ? "true" : "false"));
    }
    syncTrigger();

    let activeIdx = -1;
    const visibleItems = () => items.filter((li) => !li.hidden);
    function setActive(idx: number): void {
      const vis = visibleItems();
      items.forEach((li) => li.classList.remove("is-active"));
      if (!vis.length) { activeIdx = -1; return; }
      activeIdx = Math.max(0, Math.min(idx, vis.length - 1));
      const el = vis[activeIdx];
      el.classList.add("is-active");
      el.scrollIntoView({ block: "nearest" });
    }
    function filter(q: string): void {
      const nq = norm(q.trim());
      let any = false;
      items.forEach((li) => { const ok = !nq || li.dataset.search!.includes(nq); li.hidden = !ok; if (ok) any = true; });
      emptyEl.hidden = any;
    }

    /* ---- Positionnement (fixed, non rogné) ---- */
    const scrollParents: HTMLElement[] = [];
    for (let p = field.parentElement; p; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === "auto" || oy === "scroll") scrollParents.push(p);
    }
    function position(): void {
      const r = trigger.getBoundingClientRect();
      const w = Math.min(340, Math.max(240, window.innerWidth - 24));
      let left = Math.min(r.left, window.innerWidth - 12 - w);
      if (left < 12) left = 12;
      pop.style.width = w + "px";
      pop.style.left = left + "px";
      const below = window.innerHeight - r.bottom;
      if (below < 280 && r.top > below) { pop.style.top = "auto"; pop.style.bottom = window.innerHeight - r.top + 6 + "px"; }
      else { pop.style.bottom = "auto"; pop.style.top = r.bottom + 6 + "px"; }
    }

    function onDocPointer(e: Event): void { const t = e.target as Node; if (!combo.contains(t) && !pop.contains(t)) close(); }

    function open(): void {
      if (!pop.hidden) return;
      pop.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      searchEl.value = "";
      filter("");
      position();
      const selVisible = visibleItems().findIndex((li) => li.getAttribute("aria-selected") === "true");
      setActive(selVisible >= 0 ? selVisible : 0);
      requestAnimationFrame(() => searchEl.focus());
      document.addEventListener("pointerdown", onDocPointer, true);
      window.addEventListener("resize", position);
      scrollParents.forEach((p) => p.addEventListener("scroll", position, { passive: true }));
    }
    function close(): void {
      if (pop.hidden) return;
      pop.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onDocPointer, true);
      window.removeEventListener("resize", position);
      scrollParents.forEach((p) => p.removeEventListener("scroll", position));
    }
    function choose(li: HTMLLIElement): void {
      select.selectedIndex = Number(li.dataset.idx);
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncTrigger();
      close();
      field.querySelector<HTMLInputElement>('input[type="tel"]')?.focus();
    }

    trigger.addEventListener("click", () => (pop.hidden ? open() : close()));
    trigger.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
    searchEl.addEventListener("input", () => { filter(searchEl.value); setActive(0); });
    listEl.addEventListener("click", (e) => {
      const li = (e.target as HTMLElement).closest<HTMLLIElement>(".pf-opt");
      if (li) choose(li);
    });
    pop.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); trigger.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIdx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIdx - 1); }
      else if (e.key === "Enter") { e.preventDefault(); const v = visibleItems(); if (v[activeIdx]) choose(v[activeIdx]); }
    });
  });
}
