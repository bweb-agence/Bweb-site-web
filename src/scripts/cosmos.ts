/* =========================================================
   BWEB AGENCE — Cosmos plein cadre (DA : magie de l'IA)
   Couvre toute la section hero : champ d'étoiles scintillant,
   astres en orbite elliptique, constellation « Trajectoire » qui se
   trace, étoile-IA (Lottie) au centre. Interactif à la souris
   (parallaxe de profondeur + halo lumineux) et au scroll (Lenis).
   Tout mouvement passe par gsap.matchMedia() -> figé si l'utilisateur
   demande à réduire les animations. Reconstruit au redimensionnement.
   ========================================================= */
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
const NS = "http://www.w3.org/2000/svg";
const rand = (a: number, b: number) => Math.random() * (b - a) + a;

function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const n = document.createElementNS(NS, name);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  return n;
}

export function initCosmos(): void {
  document.querySelectorAll<HTMLElement>("[data-cosmos]").forEach(setup);
}

function setup(root: HTMLElement): void {
  const sky = root.querySelector<SVGSVGElement>("[data-sky]");
  if (!sky) return;
  const starWrap = root.querySelector<HTMLElement>("[data-star-wrap]");
  const starEl = root.querySelector<HTMLElement>(".cosmic-star");
  const cursor = root.querySelector<HTMLElement>(".cosmic-cursor");
  const host = root.closest("section") || root;
  let ctx: gsap.Context | null = null;

  const build = () => {
    ctx?.revert();
    while (sky.firstChild) sky.removeChild(sky.firstChild);

    const rect = root.getBoundingClientRect();
    const W = Math.max(360, Math.round(rect.width));
    const H = Math.max(360, Math.round(rect.height));
    sky.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const wide = W >= 900;
    const sx = wide ? W * 0.72 : W * 0.5;
    const sy = wide ? H * 0.42 : H * 0.3;
    if (starWrap) {
      starWrap.style.left = `${((sx / W) * 100).toFixed(2)}%`;
      starWrap.style.top = `${((sy / H) * 100).toFixed(2)}%`;
    }

    const gFar = svgEl("g", {});
    const gOrbits = svgEl("g", {});
    const gNear = svgEl("g", {});
    const gConst = svgEl("g", {});
    const gAstres = svgEl("g", {});
    sky.append(gOrbits, gFar, gConst, gNear, gAstres);

    // ---- Étoiles ----
    const area = W * H;
    const mk = (g: SVGGElement, n: number, rMax: number, opBase: number) => {
      const l: SVGCircleElement[] = [];
      for (let i = 0; i < n; i++) {
        const c = svgEl("circle", { cx: rand(0, W).toFixed(1), cy: rand(0, H).toFixed(1), r: rand(0.4, rMax).toFixed(2), fill: "#fff", opacity: rand(opBase, opBase + 0.5).toFixed(2) });
        g.appendChild(c);
        l.push(c);
      }
      return l;
    };
    const far = mk(gFar, Math.min(260, Math.round(area / 5200)), 1.1, 0.1);
    const near = mk(gNear, Math.min(120, Math.round(area / 12000)), 1.9, 0.3);

    // ---- Orbites + astres ----
    const base = Math.min(W, H);
    const odef = [
      { rx: base * 0.42, ry: base * 0.22, tilt: -20, r: 5.5, c: "#00C89E", dur: 30, from: 0.3 },
      { rx: base * 0.3, ry: base * 0.4, tilt: 16, r: 7, c: "#FF835F", dur: 42, from: 2.4 },
      { rx: base * 0.48, ry: base * 0.4, tilt: 44, r: 4, c: "#3B82F6", dur: 54, from: 4.1 },
    ];
    const astres = odef.map((o) => {
      gOrbits.appendChild(svgEl("ellipse", { cx: sx, cy: sy, rx: o.rx, ry: o.ry, fill: "none", stroke: "rgba(255,255,255,.08)", "stroke-width": 1, transform: `rotate(${o.tilt} ${sx} ${sy})` }));
      const glow = svgEl("circle", { r: o.r + 5, fill: o.c, opacity: 0.22 });
      const planet = svgEl("circle", { r: o.r, fill: o.c });
      gAstres.append(glow, planet);
      const t = (o.tilt * Math.PI) / 180;
      const place = (a: number) => {
        const x = o.rx * Math.cos(a), y = o.ry * Math.sin(a);
        const xr = x * Math.cos(t) - y * Math.sin(t), yr = x * Math.sin(t) + y * Math.cos(t);
        glow.setAttribute("cx", String(sx + xr)); glow.setAttribute("cy", String(sy + yr));
        planet.setAttribute("cx", String(sx + xr)); planet.setAttribute("cy", String(sy + yr));
      };
      place(o.from);
      return { o, place };
    });

    // ---- Constellation « Trajectoire » (bas-gauche -> étoile) ----
    const cpts = [[W * 0.1, H * 0.82], [W * 0.24, H * 0.68], [W * 0.38, H * 0.74], [W * 0.52, H * 0.56], [sx - base * 0.16, sy + base * 0.12]];
    const d = cpts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
    const cpath = svgEl("path", { d, fill: "none", stroke: "rgba(255,199,42,.5)", "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round" });
    gConst.appendChild(cpath);
    cpts.forEach((p) => gConst.appendChild(svgEl("circle", { cx: p[0], cy: p[1], r: 2.2, fill: "#FFC72A" })));
    const clen = cpath.getTotalLength();

    // ---- Animations + interaction (désactivées si reduced-motion) ----
    ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        [...far, ...near].forEach((s) => {
          const b = parseFloat(s.getAttribute("opacity") || "0.4");
          gsap.to(s, { opacity: gsap.utils.clamp(0.05, 1, b + 0.35), duration: rand(1.4, 3.6), delay: rand(0, 3), repeat: -1, yoyo: true, ease: "sine.inOut" });
        });
        astres.forEach((a) =>
          gsap.to({ ang: a.o.from }, { ang: a.o.from + Math.PI * 2, duration: a.o.dur, repeat: -1, ease: "none", onUpdate: function () { a.place((this.targets()[0] as { ang: number }).ang); } }),
        );
        gsap.set(cpath, { strokeDasharray: clen, strokeDashoffset: clen });
        gsap.to(cpath, { strokeDashoffset: 0, duration: 2.4, delay: 0.3, ease: "power2.inOut" });
        gsap.fromTo(gConst.querySelectorAll("circle"), { scale: 0, transformOrigin: "center" }, { scale: 1, duration: 0.5, stagger: 0.16, delay: 0.4, ease: "back.out(2)" });

        // Parallaxe au scroll (profondeur)
        gsap.to(gFar, { yPercent: 6, ease: "none", scrollTrigger: { trigger: host, start: "top top", end: "bottom top", scrub: 1 } });
        gsap.to(gNear, { yPercent: -12, ease: "none", scrollTrigger: { trigger: host, start: "top top", end: "bottom top", scrub: 1 } });

        // Parallaxe à la souris (la scène réagit au curseur)
        const q = (el: Element | null) => (el ? { x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3" }), y: gsap.quickTo(el, "y", { duration: 0.9, ease: "power3" }) } : null);
        const movers = [
          { m: q(gFar)!, ax: 16, ay: 12 },
          { m: q(gNear)!, ax: 34, ay: 26 },
          { m: q(gOrbits)!, ax: 22, ay: 18 },
          { m: q(gAstres)!, ax: 30, ay: 24 },
          { m: q(starEl), ax: 20, ay: 16 },
        ];
        const cur = cursor ? { x: gsap.quickTo(cursor, "x", { duration: 0.5, ease: "power2" }), y: gsap.quickTo(cursor, "y", { duration: 0.5, ease: "power2" }) } : null;
        // Inclinaison 3D de la sphère vers le curseur
        const tilt = starEl ? { ry: gsap.quickTo(starEl, "rotationY", { duration: 0.9, ease: "power3" }), rx: gsap.quickTo(starEl, "rotationX", { duration: 0.9, ease: "power3" }) } : null;

        const onMove = (e: PointerEvent) => {
          const r = root.getBoundingClientRect();
          const nx = (e.clientX - r.left) / r.width - 0.5;
          const ny = (e.clientY - r.top) / r.height - 0.5;
          movers.forEach((v) => { if (!v.m) return; v.m.x(-nx * v.ax); v.m.y(-ny * v.ay); });
          if (tilt) { tilt.ry(nx * 16); tilt.rx(-ny * 16); }
          if (cur) { cursor!.style.opacity = "1"; cur.x(e.clientX - r.left); cur.y(e.clientY - r.top); }
        };
        const onLeave = () => {
          movers.forEach((v) => { if (!v.m) return; v.m.x(0); v.m.y(0); });
          if (tilt) { tilt.ry(0); tilt.rx(0); }
          if (cursor) cursor.style.opacity = "0";
        };
        host.addEventListener("pointermove", onMove);
        host.addEventListener("pointerleave", onLeave);
        return () => {
          host.removeEventListener("pointermove", onMove);
          host.removeEventListener("pointerleave", onLeave);
        };
      });
    }, root);
  };

  build();
  let tid: ReturnType<typeof setTimeout>;
  window.addEventListener("resize", () => { clearTimeout(tid); tid = setTimeout(build, 250); });
}
