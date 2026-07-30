/* =========================================================
   BWEB AGENCE — Motion (GSAP + ScrollTrigger + Lenis)
   Bundlé via Vite (aucun CDN, aucun SRI à gérer).
   Tout est encapsulé dans gsap.matchMedia() : si l'utilisateur
   demande à réduire les animations, RIEN ne se déclenche et le
   contenu reste dans son état naturel (visible, sans mouvement).
   ========================================================= */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

export function initMotion(): void {
  // Marqueur : le JS a bien démarré (voir failsafe inline dans le <head>).
  (window as unknown as { __bwebReady?: boolean }).__bwebReady = true;

  // JAMAIS de smooth-scroll (Lenis) ni d'animations de défilement dans le
  // back-office : le dashboard admin utilise le défilement natif (tiroirs qui
  // défilent en interne, tables). Lenis capterait la molette et empêcherait le
  // tiroir de scroller. Garde-fou global même si un layout admin importait ce
  // module par erreur.
  if (typeof location !== "undefined" && location.pathname.startsWith("/admin")) return;
  if (typeof document !== "undefined" && document.body?.classList.contains("admin-body")) return;

  const mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: no-preference)", () => {
    /* ---------- Smooth scroll (Lenis) piloté par le ticker GSAP ---------- */
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    /* Ancres internes : déléguer le scroll fluide à Lenis */
    const onAnchorClick = (e: Event) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!link) return;
      const id = link.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target as HTMLElement, { offset: -90 });
    };
    document.addEventListener("click", onAnchorClick);

    /* ---------- Hero : intro au chargement (jamais pré-masqué en CSS) ---------- */
    const heroEls = gsap.utils.toArray<HTMLElement>("[data-hero-in]");
    if (heroEls.length) {
      gsap.from(heroEls, {
        opacity: 0,
        y: 26,
        duration: 0.9,
        stagger: 0.12,
        ease: "power3.out",
        clearProps: "opacity,transform",
      });
    }

    /* ---------- Révélations au scroll ---------- */
    gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: "power3.out",
        delay: parseFloat(el.dataset.delay || "0") || 0,
        scrollTrigger: { trigger: el, start: "top 88%" },
      });
    });
    gsap.utils.toArray<HTMLElement>(".reveal-fade").forEach((el) => {
      gsap.to(el, { opacity: 1, duration: 1, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 90%" } });
    });
    gsap.utils.toArray<HTMLElement>(".reveal-scale").forEach((el) => {
      gsap.to(el, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%" } });
    });

    /* ---------- Stagger sur groupes ---------- */
    document.querySelectorAll<HTMLElement>("[data-stagger]").forEach((group) => {
      gsap.from(group.children, {
        opacity: 0,
        y: 32,
        duration: 0.7,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: group, start: "top 85%" },
        clearProps: "opacity,transform",
      });
    });

    /* ---------- Compteurs animés ----------
       La valeur finale est déjà rendue dans le HTML (fallback fiable si le
       JS ou l'animation ne tournent pas). Ici on ne fait qu'animer 0 → cible,
       puis on restaure le texte d'origine (format exact avec espaces). */
    document.querySelectorAll<HTMLElement>(".js-counter").forEach((el) => {
      const target = parseFloat(el.getAttribute("data-count") || "0");
      const decimals = (el.getAttribute("data-count") || "").includes(".") ? 1 : 0;
      const finalText = el.textContent || String(target);
      const fmt = (v: number) =>
        decimals ? v.toFixed(1).replace(".", ",") : Math.round(v).toLocaleString("fr-FR");
      const counter = { val: 0 };
      ScrollTrigger.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: () => {
          gsap.fromTo(
            counter,
            { val: 0 },
            {
              val: target,
              duration: 1.8,
              ease: "power2.out",
              onUpdate: () => { el.textContent = fmt(counter.val); },
              onComplete: () => { el.textContent = finalText; },
            },
          );
        },
      });
    });

    /* ---------- Parallax douce sur les blobs ---------- */
    document.querySelectorAll<HTMLElement>(".blob").forEach((blob, i) => {
      gsap.to(blob, {
        y: i % 2 === 0 ? 40 : -40,
        ease: "none",
        scrollTrigger: { trigger: blob.closest("section") || blob.parentElement, start: "top bottom", end: "bottom top", scrub: 1.2 },
      });
    });

    /* ---------- Sparkles : flottement continu ---------- */
    document.querySelectorAll<HTMLElement>(".sparkle").forEach((el, i) => {
      gsap.to(el, {
        y: i % 2 === 0 ? -14 : 14,
        rotation: i % 2 === 0 ? 12 : -12,
        duration: 2.4 + (i % 3) * 0.4,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    });

    initTextReveal();

    /* Nettoyage si la media query change (revert auto par matchMedia) */
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      document.removeEventListener("click", onAnchorClick);
    };
  });

  /* ---------- Marquees : dupliquer le contenu pour la boucle ---------- */
  document.querySelectorAll<HTMLElement>(".marquee-track").forEach((track) => {
    if (track.dataset.duplicated) return;
    track.innerHTML += track.innerHTML;
    track.dataset.duplicated = "true";
  });
}

/* ---------- Révélation de texte au scroll (mots gris -> couleur) ---------- */
function initTextReveal(): void {
  const root = getComputedStyle(document.documentElement);
  const darkColor = root.getPropertyValue("--c-navy").trim() || "#020B50";

  document.querySelectorAll<HTMLElement>(".text-reveal").forEach((el) => {
    if (el.dataset.revealed) return;
    el.dataset.revealed = "true";
    const isDark = el.classList.contains("on-dark");
    const targetColor = isDark ? "#ffffff" : darkColor;
    const startColor = isDark ? "rgba(255,255,255,.22)" : "#C7CBDB";

    const text = el.textContent || "";
    el.innerHTML = text
      .split(/(\s+)/)
      .map((chunk) => (chunk.trim() ? `<span class="word">${chunk}</span>` : chunk))
      .join("");

    const spans = el.querySelectorAll(".word");
    gsap.set(spans, { color: startColor });
    gsap.to(spans, {
      color: targetColor,
      stagger: { each: 0.02, from: "start" },
      ease: "none",
      scrollTrigger: { trigger: el, start: "top 80%", end: "bottom 55%", scrub: true },
    });
  });
}
