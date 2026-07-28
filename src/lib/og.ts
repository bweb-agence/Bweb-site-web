/* =========================================================
   Générateur d'images Open Graph dynamiques (1200×630, PNG).
   Utilise @vercel/og (Satori + resvg). Les polices sont servies
   depuis /public/fonts et chargées à la volée depuis l'origine.
   ========================================================= */
import { ImageResponse } from "@vercel/og";

// Mini-fabrique d'éléments (évite le JSX dans un fichier .ts).
type El = { type: string; props: Record<string, any> };
const h = (type: string, props: Record<string, any> | null, ...children: any[]): El => ({
  type,
  props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
});

let fontsCache: any[] | null = null;
async function loadFonts(origin: string) {
  if (fontsCache) return fontsCache;
  const grab = (f: string) => fetch(new URL(`/fonts/${f}`, origin)).then((r) => r.arrayBuffer());
  const [s700, s600, j500] = await Promise.all([grab("Sora-700.woff"), grab("Sora-600.woff"), grab("Jakarta-500.woff")]);
  fontsCache = [
    { name: "Sora", data: s700, weight: 700, style: "normal" },
    { name: "Sora", data: s600, weight: 600, style: "normal" },
    { name: "Jakarta", data: j500, weight: 500, style: "normal" },
  ];
  return fontsCache;
}

const clamp = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export interface OgOptions {
  origin: string;
  kicker: string; // thème / catégorie
  title: string;
  meta: string; // ligne du bas (date · lieu / auteur · catégorie)
}

export async function renderOg({ origin, kicker, title, meta }: OgOptions): Promise<Response> {
  const fonts = await loadFonts(origin);

  const tree = h(
    "div",
    {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        fontFamily: "Sora",
        color: "#ffffff",
        backgroundColor: "#020b50",
        backgroundImage:
          "radial-gradient(120% 90% at 12% 4%, rgba(43,123,255,0.55), transparent 55%), radial-gradient(110% 90% at 100% 100%, rgba(23,182,201,0.42), transparent 55%)",
      },
    },
    // Ligne du haut : marque + thème
    h(
      "div",
      { style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", fontSize: "34px", fontWeight: 700, letterSpacing: "-0.5px" } },
        h("div", {
          style: {
            display: "flex",
            width: "44px",
            height: "44px",
            marginRight: "16px",
            borderRadius: "12px",
            backgroundColor: "#1f6ced",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "26px",
          },
        }, "B"),
        "Bweb Agence",
      ),
      kicker
        ? h(
            "div",
            {
              style: {
                display: "flex",
                fontSize: "24px",
                fontWeight: 600,
                padding: "10px 22px",
                borderRadius: "999px",
                color: "#ffffff",
                backgroundColor: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.28)",
              },
            },
            clamp(kicker, 40),
          )
        : null,
    ),
    // Titre
    h(
      "div",
      {
        style: {
          display: "flex",
          fontSize: "68px",
          fontWeight: 700,
          lineHeight: 1.06,
          letterSpacing: "-1.5px",
          maxWidth: "1000px",
        },
      },
      clamp(title, 110),
    ),
    // Ligne du bas : méta + accent
    h(
      "div",
      { style: { display: "flex", alignItems: "center", fontFamily: "Jakarta", fontSize: "30px", fontWeight: 500, color: "rgba(255,255,255,0.9)" } },
      h("div", { style: { display: "flex", width: "34px", height: "6px", borderRadius: "999px", marginRight: "20px", backgroundColor: "#00c89e" } }),
      clamp(meta, 70),
    ),
  );

  return new ImageResponse(tree as any, {
    width: 1200,
    height: 630,
    fonts: fonts as any,
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
