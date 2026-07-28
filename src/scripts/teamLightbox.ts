/* =========================================================
   Lightbox photo — clic sur une photo de l'équipe (.avatar-badge__zoom)
   pour l'agrandir dans une fenêtre modale simple.
   ========================================================= */
export function initTeamLightbox() {
  const overlay = document.getElementById("photo-lightbox");
  const img = overlay?.querySelector<HTMLImageElement>(".photo-lightbox__img");
  const closeBtn = overlay?.querySelector<HTMLButtonElement>(".photo-lightbox__close");
  const triggers = document.querySelectorAll<HTMLButtonElement>(".avatar-badge__zoom");
  if (!overlay || !img || !closeBtn || !triggers.length) return;

  let lastFocused: HTMLElement | null = null;

  const open = (src: string, alt: string) => {
    lastFocused = document.activeElement as HTMLElement;
    img.src = src;
    img.alt = alt;
    overlay.classList.add("is-open");
    document.body.classList.add("no-scroll");
    closeBtn.focus();
  };
  const close = () => {
    overlay.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    lastFocused?.focus();
  };

  triggers.forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.dataset.lightboxSrc;
      if (src) open(src, btn.dataset.lightboxAlt || "");
    });
  });

  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) close();
  });
}
