/* =========================================================
   BWEB AGENCE — main.js
   Navigation, animations GSAP, formulaires, petits utilitaires.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- Config placeholders (a remplacer par les vraies infos) ---------- */
  window.BWEB_CONFIG = {
    whatsappNumber: "2250000000000", // format international sans "+" — A REMPLACER
    whatsappMessage: "Bonjour Bweb Agence, je souhaite en savoir plus sur vos services.",
    phoneDisplay: "+225 00 00 00 00 00",
    email: "contact@bwebagence.com"
  };

  document.addEventListener("DOMContentLoaded", function () {
    setYear();
    initHeaderScroll();
    initMobileNav();
    initActiveNavLink();
    initWhatsappLinks();
    initAccordion();
    initFilters();
    initForms();
    initGsap();
  });

  /* ---------- Annee courante dans le footer ---------- */
  function setYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });
  }

  /* ---------- Header : etat au scroll ---------- */
  function initHeaderScroll() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var toggleState = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 12);
    };
    toggleState();
    window.addEventListener("scroll", toggleState, { passive: true });
  }

  /* ---------- Menu mobile ---------- */
  function initMobileNav() {
    var toggle = document.querySelector(".nav-toggle");
    var mobileNav = document.querySelector(".mobile-nav");
    if (!toggle || !mobileNav) return;
    var close = function () {
      toggle.classList.remove("is-open");
      mobileNav.classList.remove("is-open");
      document.body.classList.remove("no-scroll");
      toggle.setAttribute("aria-expanded", "false");
    };
    toggle.addEventListener("click", function () {
      var isOpen = toggle.classList.toggle("is-open");
      mobileNav.classList.toggle("is-open", isOpen);
      document.body.classList.toggle("no-scroll", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
    mobileNav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", close);
    });
  }

  /* ---------- Lien actif dans le menu ---------- */
  function initActiveNavLink() {
    var current = (window.location.pathname.split("/").pop() || "index.html");
    document.querySelectorAll(".main-nav a, .mobile-nav a").forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href) return;
      if (href === current || (current === "" && href === "index.html")) {
        a.classList.add("active");
      }
    });
  }

  /* ---------- Liens WhatsApp dynamiques ---------- */
  function initWhatsappLinks() {
    var base = "https://wa.me/" + window.BWEB_CONFIG.whatsappNumber + "?text=" + encodeURIComponent(window.BWEB_CONFIG.whatsappMessage);
    document.querySelectorAll("[data-whatsapp-link]").forEach(function (a) {
      a.setAttribute("href", base);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    });
    document.querySelectorAll("[data-phone-display]").forEach(function (el) {
      el.textContent = window.BWEB_CONFIG.phoneDisplay;
    });
    document.querySelectorAll("[data-email-display]").forEach(function (el) {
      el.textContent = window.BWEB_CONFIG.email;
      if (el.tagName === "A") el.setAttribute("href", "mailto:" + window.BWEB_CONFIG.email);
    });
  }

  /* ---------- Accordion (FAQ / infos formation) ---------- */
  function initAccordion() {
    document.querySelectorAll(".accordion-item").forEach(function (item) {
      var btn = item.querySelector("button");
      var panel = item.querySelector(".accordion-panel");
      if (!btn || !panel) return;
      btn.addEventListener("click", function () {
        var isOpen = item.classList.contains("is-open");
        item.parentElement.querySelectorAll(".accordion-item").forEach(function (i) {
          i.classList.remove("is-open");
          i.querySelector(".accordion-panel").style.maxHeight = null;
        });
        if (!isOpen) {
          item.classList.add("is-open");
          panel.style.maxHeight = panel.scrollHeight + "px";
        }
      });
    });
  }

  /* ---------- Filtres page Realisations ---------- */
  function initFilters() {
    var bar = document.querySelector(".filter-bar");
    if (!bar) return;
    var buttons = bar.querySelectorAll(".filter-btn");
    var cards = document.querySelectorAll("[data-category]");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var filter = btn.getAttribute("data-filter");
        cards.forEach(function (card) {
          var cats = (card.getAttribute("data-category") || "").split(",");
          var show = filter === "all" || cats.indexOf(filter) !== -1;
          card.style.display = show ? "" : "none";
          if (show && window.gsap) {
            gsap.fromTo(card, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .45, ease: "power2.out" });
          }
        });
      });
    });
  }

  /* ---------- Formulaires (contact, devis) ---------- */
  function initForms() {
    document.querySelectorAll("form[data-form]").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var status = form.querySelector(".form-status");
        var required = form.querySelectorAll("[required]");
        var valid = true;
        required.forEach(function (field) {
          if (!field.value || !field.value.trim()) valid = false;
        });
        if (!valid) {
          if (status) {
            status.textContent = "Merci de remplir tous les champs obligatoires (*).";
            status.classList.add("error");
          }
          return;
        }
        if (status) { status.textContent = ""; status.classList.remove("error"); }

        /*
          Site statique : aucun backend connecte pour l'instant.
          A la mise en ligne, relier ce formulaire a un service
          (Formspree, EmailJS, Make/Zapier ou une fonction serverless)
          qui enverra les donnees vers contact@bwebagence.com.
          En attendant, on redirige simplement vers la page de remerciement.
        */
        var dest = form.getAttribute("data-redirect") || "merci.html";
        window.location.href = dest;
      });
    });
  }

  /* ---------- GSAP : reveals, compteurs, hero ---------- */
  function initGsap() {
    if (!window.gsap) return;
    gsap.registerPlugin(ScrollTrigger);

    /* Reveal generique au scroll.
       L'etat initial est fixe ici (gsap.set), pas en CSS statique : si ce
       script ne s'execute pas (CDN indisponible), le contenu reste visible. */
    var reveals = gsap.utils.toArray(".reveal");
    reveals.forEach(function (el, i) {
      gsap.set(el, { opacity: 0, y: 36 });
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: .9,
        ease: "power3.out",
        delay: (parseFloat(el.dataset.delay) || 0),
        scrollTrigger: { trigger: el, start: "top 88%" }
      });
    });

    gsap.utils.toArray(".reveal-fade").forEach(function (el) {
      gsap.set(el, { opacity: 0 });
      gsap.to(el, { opacity: 1, duration: 1, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 90%" } });
    });

    gsap.utils.toArray(".reveal-scale").forEach(function (el) {
      gsap.set(el, { opacity: 0, scale: .92 });
      gsap.to(el, { opacity: 1, scale: 1, duration: .8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } });
    });

    /* Stagger sur groupes de cartes */
    document.querySelectorAll("[data-stagger]").forEach(function (group) {
      var items = group.children;
      gsap.fromTo(items, { opacity: 0, y: 32 }, {
        opacity: 1, y: 0, duration: .7, stagger: .12, ease: "power3.out",
        scrollTrigger: { trigger: group, start: "top 85%" }
      });
    });

    /* Hero : intro au chargement */
    var heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
    var heroEls = document.querySelectorAll("[data-hero-in]");
    if (heroEls.length) {
      heroTl.fromTo(heroEls, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: .9, stagger: .12 });
    }

    /* Compteurs animes */
    document.querySelectorAll(".js-counter").forEach(function (el) {
      var target = parseFloat(el.getAttribute("data-count") || "0");
      var decimals = (el.getAttribute("data-count") || "").includes(".") ? 1 : 0;
      var counter = { val: 0 };
      ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: function () {
          gsap.to(counter, {
            val: target,
            duration: 1.8,
            ease: "power2.out",
            onUpdate: function () {
              el.textContent = counter.val.toFixed(decimals).replace(".", ",");
            }
          });
        }
      });
    });

    /* Parallax douce sur les blobs decoratifs */
    document.querySelectorAll(".blob").forEach(function (blob, i) {
      gsap.to(blob, {
        y: i % 2 === 0 ? 40 : -40,
        ease: "none",
        scrollTrigger: { trigger: blob.closest("section") || blob.parentElement, start: "top bottom", end: "bottom top", scrub: 1.2 }
      });
    });

    /* Marquee : dupliquer le contenu pour boucle infinie */
    document.querySelectorAll(".marquee-track").forEach(function (track) {
      if (track.dataset.duplicated) return;
      track.innerHTML += track.innerHTML;
      track.dataset.duplicated = "true";
    });
  }
})();
