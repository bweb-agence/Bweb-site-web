/* =========================================================
   BWEB AGENCE — Lottie (animations vectorielles légères)
   Utilisation dans le HTML :
     <div class="lottie" data-lottie="/lottie/mon-anim.json"
          data-loop="true" style="--lottie-ratio: 16/9"></div>
   Chargement paresseux : l'animation n'est initialisée que
   lorsqu'elle entre dans le viewport (économie réseau/CPU).
   prefers-reduced-motion : rendu figé sur la 1re frame.
   ========================================================= */
import lottie, { type AnimationItem } from "lottie-web";

export function initLottie(): void {
  const nodes = document.querySelectorAll<HTMLElement>("[data-lottie]");
  if (!nodes.length) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const load = (el: HTMLElement) => {
    if (el.dataset.lottieLoaded) return;
    el.dataset.lottieLoaded = "true";
    const path = el.dataset.lottie;
    if (!path) return;

    const anim: AnimationItem = lottie.loadAnimation({
      container: el,
      renderer: "svg",
      loop: el.dataset.loop !== "false",
      autoplay: !reduce,
      path,
    });

    if (reduce) {
      // Animation figée : afficher une image, pas du mouvement.
      anim.addEventListener("DOMLoaded", () => anim.goToAndStop(0, true));
    }
  };

  if (!("IntersectionObserver" in window)) {
    nodes.forEach(load);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        load(entry.target as HTMLElement);
        io.unobserve(entry.target);
      });
    },
    { rootMargin: "200px 0px" },
  );
  nodes.forEach((el) => io.observe(el));
}
