/* =========================================================
   BWEB AGENCE — UI : header, menu mobile, nav active,
   navigation latérale (scroll-spy), accordéon, filtres, année.
   ========================================================= */
import { gsap } from "gsap";

/* ---------- Année courante ---------- */
export function setYear(): void {
  document.querySelectorAll<HTMLElement>("[data-year]").forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}

/* ---------- Header : état au scroll ---------- */
export function initHeaderScroll(): void {
  const header = document.querySelector<HTMLElement>(".site-header");
  if (!header) return;
  const toggle = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
  toggle();
  window.addEventListener("scroll", toggle, { passive: true });
}

/* ---------- Menu mobile ---------- */
export function initMobileNav(): void {
  const toggle = document.querySelector<HTMLElement>(".nav-toggle");
  const mobileNav = document.querySelector<HTMLElement>(".mobile-nav");
  if (!toggle || !mobileNav) return;
  const close = () => {
    toggle.classList.remove("is-open");
    mobileNav.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const isOpen = toggle.classList.toggle("is-open");
    mobileNav.classList.toggle("is-open", isOpen);
    document.body.classList.toggle("no-scroll", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
  mobileNav.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mobileNav.classList.contains("is-open")) close();
  });
}

/* ---------- Navigation latérale par sections (scroll-spy) ---------- */
export function initSectionNav(): void {
  const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-section]"));
  if (sections.length < 2) return;

  const nav = document.createElement("nav");
  nav.className = "section-nav";
  nav.setAttribute("aria-label", "Navigation dans la page");

  const entries = sections.map((section) => {
    const label = section.getAttribute("data-nav-section") || "";
    if (!section.id) {
      section.id = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }
    const item = document.createElement("button");
    item.type = "button";
    item.className = "section-nav__item";
    item.setAttribute("aria-label", "Aller à la section " + label);
    item.innerHTML = `<span class="section-nav__label">${label}</span><span class="section-nav__dash"></span>`;
    item.addEventListener("click", () => section.scrollIntoView({ behavior: "smooth", block: "start" }));
    nav.appendChild(item);
    return { section, item };
  });

  document.body.appendChild(nav);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (observed) => {
        observed.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const match = entries.find((e) => e.section === entry.target);
          if (!match) return;
          entries.forEach((e) => e.item.classList.remove("is-active"));
          match.item.classList.add("is-active");
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    entries.forEach((e) => observer.observe(e.section));
  } else {
    entries[0].item.classList.add("is-active");
  }
}

/* ---------- Accordéon (FAQ / infos) ---------- */
export function initAccordion(): void {
  document.querySelectorAll<HTMLElement>(".accordion-item").forEach((item) => {
    const btn = item.querySelector("button");
    const panel = item.querySelector<HTMLElement>(".accordion-panel");
    if (!btn || !panel) return;
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => {
      const isOpen = item.classList.contains("is-open");
      item.parentElement?.querySelectorAll<HTMLElement>(".accordion-item").forEach((i) => {
        i.classList.remove("is-open");
        i.querySelector("button")?.setAttribute("aria-expanded", "false");
        const p = i.querySelector<HTMLElement>(".accordion-panel");
        if (p) p.style.maxHeight = "";
      });
      if (!isOpen) {
        item.classList.add("is-open");
        btn.setAttribute("aria-expanded", "true");
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    });
  });
}

/* ---------- Filtres page Réalisations ---------- */
export function initFilters(): void {
  const bar = document.querySelector<HTMLElement>(".filter-bar");
  if (!bar) return;
  const buttons = bar.querySelectorAll<HTMLButtonElement>(".filter-btn");
  const cards = document.querySelectorAll<HTMLElement>("[data-category]");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const filter = btn.getAttribute("data-filter");
      cards.forEach((card) => {
        const cats = (card.getAttribute("data-category") || "").split(",");
        const show = filter === "all" || cats.indexOf(filter || "") !== -1;
        card.style.display = show ? "" : "none";
        if (show && !reduce) {
          gsap.fromTo(card, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" });
        }
      });
    });
  });
}
