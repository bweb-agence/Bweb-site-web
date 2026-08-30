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

  const FOCUSABLE =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const isOpen = () => mobileNav.classList.contains("is-open");
  const focusables = () =>
    Array.from(mobileNav.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null && el.getAttribute("tabindex") !== "-1",
    );
  let lastFocused: HTMLElement | null = null;

  const collapseSubmenus = () => {
    mobileNav.querySelectorAll<HTMLElement>(".mobile-nav-item").forEach((item) => {
      item.classList.remove("is-open");
      item.querySelector<HTMLButtonElement>(".mobile-nav-item__toggle")?.setAttribute("aria-expanded", "false");
      const submenu = item.querySelector<HTMLElement>(".mobile-nav-submenu");
      if (submenu) submenu.style.maxHeight = "";
      submenu?.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => (a.tabIndex = -1));
    });
  };

  const open = () => {
    lastFocused = (document.activeElement as HTMLElement) || toggle;
    toggle.classList.add("is-open");
    mobileNav.classList.add("is-open");
    document.body.classList.add("no-scroll");
    toggle.setAttribute("aria-expanded", "true");
    // Déplace le focus DANS le panneau (bouton Fermer en priorité).
    const first = mobileNav.querySelector<HTMLElement>(".mobile-nav__close") || focusables()[0];
    requestAnimationFrame(() => first?.focus());
  };
  const close = () => {
    toggle.classList.remove("is-open");
    mobileNav.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    toggle.setAttribute("aria-expanded", "false");
    lastFocused?.focus(); // rend le focus au déclencheur
    collapseSubmenus();
  };

  toggle.addEventListener("click", () => (isOpen() ? close() : open()));
  mobileNav.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
  mobileNav.querySelector(".mobile-nav__close")?.addEventListener("click", close);

  // Sous-menus (ex. Services) : accordéon indépendant du panneau principal.
  mobileNav.querySelectorAll<HTMLElement>(".mobile-nav-item").forEach((item) => {
    const submenuToggle = item.querySelector<HTMLButtonElement>(".mobile-nav-item__toggle");
    const submenu = item.querySelector<HTMLElement>(".mobile-nav-submenu");
    if (!submenuToggle || !submenu) return;
    const links = Array.from(submenu.querySelectorAll<HTMLAnchorElement>("a"));
    submenuToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const willOpen = !item.classList.contains("is-open");
      item.classList.toggle("is-open", willOpen);
      submenuToggle.setAttribute("aria-expanded", String(willOpen));
      submenu.style.maxHeight = willOpen ? submenu.scrollHeight + "px" : "";
      links.forEach((a) => (a.tabIndex = willOpen ? 0 : -1));
    });
  });

  document.addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    if (e.key === "Escape") { close(); return; }
    if (e.key !== "Tab") return;
    // Piège à focus : maintient la tabulation à l'intérieur du menu.
    const items = focusables();
    if (!items.length) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement as HTMLElement;
    if (e.shiftKey && (active === firstEl || !mobileNav.contains(active))) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  });
}

/* ---------- Méga-menu : tolérance au trajet de la souris ----------
   Le panneau s'ouvre au survol en CSS pur (`:hover`, `:focus-within`), ce qui
   marche sans JavaScript. Mais depuis qu'il occupe TOUTE la largeur de
   l'en-tête, ce socle ne suffit plus : il reste 19 px de bande morte entre le
   bas du libellé et le haut du panneau, et le libellé ne fait que 107 px de
   large contre 1 278 px au panneau. Qui vise le milieu ou la droite du menu
   sort de la colonne du libellé avant même d'avoir atteint le panneau, et
   celui-ci se referme sous ses yeux.

   D'où ce complément : on maintient l'ouverture pendant un court instant après
   la sortie, le temps de traverser. Le survol CSS reste le socle — sans
   JavaScript, le menu se comporte comme avant. */
const DELAI_FERMETURE = 260;

export function initMegaMenu(): void {
  document.querySelectorAll<HTMLElement>(".nav-item.has-mega").forEach((item) => {
    let fermeture = 0;

    const ouvrir = () => {
      window.clearTimeout(fermeture);
      item.classList.add("is-open");
    };
    const fermer = (immediat = false) => {
      window.clearTimeout(fermeture);
      if (immediat) item.classList.remove("is-open");
      else fermeture = window.setTimeout(() => item.classList.remove("is-open"), DELAI_FERMETURE);
    };

    item.addEventListener("pointerenter", ouvrir);
    item.addEventListener("pointerleave", () => fermer());
    /* Le clavier n'a pas de trajet à parcourir : il ouvre et ferme net. */
    item.addEventListener("focusin", ouvrir);
    item.addEventListener("focusout", (e) => {
      if (!item.contains(e.relatedTarget as Node)) fermer(true);
    });
    /* Suivre un lien du panneau doit le refermer tout de suite : sinon il
       reste affiché par-dessus la page d'arrivée le temps du délai. */
    item.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => fermer(true)));
    item.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fermer(true);
        item.querySelector<HTMLElement>(":scope > a")?.focus();
      }
    });
  });
}

/* ---------- Navigation latérale par sections (scroll-spy) ---------- */
export function initSectionNav(): void {
  // On exclut les heros (.page-hero) : leur label opaque, fixé à droite,
  // chevaucherait l'illustration du hero. Le scroll-spy démarre donc à la
  // première section de contenu.
  const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-nav-section]"))
    .filter((s) => !s.classList.contains("page-hero"));
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
    // Construction via API DOM (pas d'innerHTML) : aucune interpolation de
    // chaîne dans le HTML, robuste si un libellé contient des caractères < & >.
    const labelEl = document.createElement("span");
    labelEl.className = "section-nav__label";
    labelEl.textContent = label;
    const dashEl = document.createElement("span");
    dashEl.className = "section-nav__dash";
    item.append(labelEl, dashEl);
    item.addEventListener("click", () => section.scrollIntoView({ behavior: "smooth", block: "start" }));
    nav.appendChild(item);
    return { section, item };
  });

  document.body.appendChild(nav);

  // N'afficher le scroll-spy qu'une fois le hero dépassé : il ne chevauche
  // ainsi jamais l'illustration du hero.
  const toggleNavVisibility = () => {
    nav.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.6);
  };
  toggleNavVisibility();
  window.addEventListener("scroll", toggleNavVisibility, { passive: true });

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
