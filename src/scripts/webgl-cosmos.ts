/* =========================================================
   BWEB AGENCE — Fond cosmique WebGL (OGL)
   Nuage de particules GPU (poussière d'étoiles) qui dérive doucement
   et réagit au curseur, en couches de profondeur. Ajoute l'atmosphère
   « waouh » derrière la scène SVG. Chargé dynamiquement et seulement
   si l'utilisateur ne réduit pas les animations (voir cosmos.ts).
   Retourne une fonction de nettoyage.
   ========================================================= */
import { Renderer, Camera, Transform, Geometry, Program, Mesh } from "ogl";

export function initWebGLCosmos(canvas: HTMLCanvasElement): () => void {
  const renderer = new Renderer({ canvas, alpha: true, dpr: Math.min(2, window.devicePixelRatio || 1) });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);

  const camera = new Camera(gl, { fov: 45 });
  camera.position.z = 5;
  const scene = new Transform();

  // ---- Particules ----
  const N = 520;
  const position = new Float32Array(N * 3);
  const random = new Float32Array(N * 4);
  const color = new Float32Array(N * 3);
  const palette = [
    [1, 1, 1],
    [0.36, 0.6, 1],
    [1, 0.78, 0.16],
    [0.18, 0.83, 0.65],
    [1, 0.51, 0.37],
  ];
  for (let i = 0; i < N; i++) {
    position.set([(Math.random() * 2 - 1) * 6.5, (Math.random() * 2 - 1) * 4.2, (Math.random() * 2 - 1) * 2.5], i * 3);
    random.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    const c = palette[(Math.random() * palette.length) | 0];
    // majorité de blanc/bleu pâle, accents plus rares
    const cc = Math.random() < 0.62 ? (Math.random() < 0.5 ? palette[0] : palette[1]) : c;
    color.set(cc, i * 3);
  }

  const geometry = new Geometry(gl, {
    position: { size: 3, data: position },
    random: { size: 4, data: random },
    color: { size: 3, data: color },
  });

  const program = new Program(gl, {
    vertex: /* glsl */ `
      attribute vec3 position;
      attribute vec4 random;
      attribute vec3 color;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform float uTime;
      uniform vec2 uMouse;
      uniform float uSize;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vColor = color;
        vec3 p = position;
        float t = uTime * 0.08;
        p.x += sin(t + random.x * 6.2831) * 0.28;
        p.y += cos(t * 1.1 + random.y * 6.2831) * 0.28;
        // parallaxe curseur, plus forte pour les particules proches
        p.xy += uMouse * (0.25 + random.z * 0.85);
        vTwinkle = 0.5 + 0.5 * sin(uTime * 1.4 * (random.w + 0.3) + random.x * 10.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (random.z * 2.0 + 0.5) * (1.0 / -mv.z);
      }
    `,
    fragment: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a * (0.28 + vTwinkle * 0.5));
      }
    `,
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: [0, 0] },
      uSize: { value: 62 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  // Rendu additif (glow)
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  const mesh = new Mesh(gl, { geometry, program, mode: gl.POINTS });
  mesh.setParent(scene);

  // On mesure le PARENT (.cosmic-bg, toujours en inset:0) et non le canvas :
  // OGL pose un style inline (300×150 par défaut) sur le canvas, ce qui masque
  // le CSS width/height:100% et fige la taille (poussières bloquées en haut-gauche).
  const sizer = (canvas.parentElement as HTMLElement) || canvas;
  const resize = () => {
    const w = sizer.clientWidth;
    const h = sizer.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.perspective({ aspect: w / h });
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(sizer);

  const mouse = [0, 0];
  const target = [0, 0];
  const host = (canvas.closest("section") as HTMLElement) || window;
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    target[0] = ((e.clientX - r.left) / r.width - 0.5) * 1.3;
    target[1] = -((e.clientY - r.top) / r.height - 0.5) * 0.9;
  };
  host.addEventListener("pointermove", onMove as EventListener);

  let raf = 0;
  let running = true;
  const loop = (t: number) => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    mouse[0] += (target[0] - mouse[0]) * 0.045;
    mouse[1] += (target[1] - mouse[1]) * 0.045;
    program.uniforms.uTime.value = t * 0.001;
    program.uniforms.uMouse.value = mouse;
    renderer.render({ scene, camera });
  };
  raf = requestAnimationFrame(loop);

  // Pause hors écran (perf)
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting && !running) { running = true; raf = requestAnimationFrame(loop); }
      else if (!en.isIntersecting) { running = false; cancelAnimationFrame(raf); }
    });
  });
  io.observe(canvas);

  return () => {
    running = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    host.removeEventListener("pointermove", onMove as EventListener);
  };
}
