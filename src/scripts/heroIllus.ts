/* =========================================================
   Illustrations de hero — parallaxe souris partagée
   Chaque illustration sur-mesure utilise le conteneur
   `.hero-illus[data-parallax]` avec `.hi-scene` (le SVG) et
   `.hi-glow` (le halo). Le visuel "flotte" doucement dans le
   hero pour renforcer la fusion. Désactivé en reduced-motion.
   ========================================================= */
export function initHeroIllus(): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;

  document.querySelectorAll<HTMLElement>(".hero-illus[data-parallax]").forEach((viz) => {
    const hero = viz.closest<HTMLElement>(".page-hero") ?? viz;
    const scene = viz.querySelector<HTMLElement>(".hi-scene");
    const glow = viz.querySelector<HTMLElement>(".hi-glow");
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;

    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      if (scene) scene.style.transform = `translate(${cx * 10}px, ${cy * 10}px)`;
      if (glow) glow.style.transform = `translate(${cx * -16}px, ${cy * -16}px)`;
      raf = Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    hero.addEventListener("pointermove", onMove, { passive: true });
    hero.addEventListener("pointerleave", () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
  });
}
