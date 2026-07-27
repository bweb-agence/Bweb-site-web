/* =========================================================
   BWEB AGENCE — Point d'entrée client
   Bundlé par Astro/Vite. Importé une seule fois dans le layout.
   ========================================================= */
import { contact, whatsappLink } from "../config/site";
import { setYear, initHeaderScroll, initMobileNav, initSectionNav, initAccordion, initFilters } from "./ui";
import { initForms } from "./forms";
import { initWizard } from "./wizard";
import { initPhoneField } from "./phoneField";
import { initFileUpload } from "./fileUpload";
import { initLottie } from "./lottie";
import { initCosmos } from "./cosmos";
import { initHeroIllus } from "./heroIllus";
import { initMotion } from "./motion";

/* Remplit les liens/affichages de contact depuis la config centrale.
   Permet aux contenus qui utilisent [data-whatsapp-link] etc. de rester
   synchronisés avec src/config/site.ts sans édition manuelle. */
function initContactLinks(): void {
  const href = whatsappLink();
  document.querySelectorAll<HTMLAnchorElement>("[data-whatsapp-link]").forEach((a) => {
    a.setAttribute("href", a.dataset.whatsappSecondary !== undefined ? whatsappLink(undefined, contact.whatsapp.secondary) : href);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  });
  document.querySelectorAll<HTMLElement>("[data-phone-display]").forEach((el) => {
    el.textContent = contact.phoneDisplay;
    if (el.tagName === "A") (el as HTMLAnchorElement).href = "tel:+" + contact.whatsapp.primary;
  });
  document.querySelectorAll<HTMLElement>("[data-email-display]").forEach((el) => {
    el.textContent = contact.email;
    if (el.tagName === "A") (el as HTMLAnchorElement).href = "mailto:" + contact.email;
  });
}

/* Masque aux lecteurs d'écran les SVG purement décoratifs (icônes).
   Un SVG porteur de sens doit avoir role="img" + aria-label ; tous les
   autres sont décoratifs et ne doivent pas être annoncés. (A11Y-03) */
function hideDecorativeSvg(): void {
  document.querySelectorAll<SVGElement>("svg:not([aria-label]):not([role])").forEach((svg) => {
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
  });
}

function boot(): void {
  setYear();
  hideDecorativeSvg();
  initContactLinks();
  initHeaderScroll();
  initMobileNav();
  initSectionNav();
  initAccordion();
  initFilters();
  initForms();
  initWizard();
  initPhoneField();
  initFileUpload();
  initLottie();
  initCosmos();
  initHeroIllus();
  initMotion();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
