/* =========================================================
   BWEB AGENCE — Sanitisation du HTML riche (defense-in-depth)
   -----------------------------------------------------------
   Le contenu éditorial (descriptions de formations/sessions, articles de blog,
   FAQ) est saisi par l'équipe via l'éditeur TipTap ou en Markdown, puis rendu
   sur les pages publiques via `set:html`. Ces auteurs sont de confiance, mais on
   nettoie malgré tout le HTML côté serveur avant rendu : un compte admin
   compromis (ou un copier-coller depuis une source douteuse) ne doit pas pouvoir
   injecter de <script>, gestionnaire d'évènement (onload=…) ou URL javascript:.

   L'allowlist couvre exactement ce que produisent nos deux sources :
   - TipTap : starter-kit + image, link, underline, text-align, table.
   - marked : titres, listes, liens, images, code, citations, tableaux GFM.
   ========================================================= */
import sanitizeHtml from "sanitize-html";

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "div", "span",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "del", "mark", "sub", "sup", "small",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "a", "img",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    // TipTap pose l'alignement via style="text-align:…" (blocs) ; on ne laisse
    // que cette propriété (allowedStyles ci-dessous en restreint les valeurs).
    p: ["style"], h1: ["style"], h2: ["style"], h3: ["style"],
    h4: ["style"], h5: ["style"], h6: ["style"],
    td: ["style", "colspan", "rowspan"], th: ["style", "colspan", "rowspan"],
    col: ["span", "style"], colgroup: ["span"],
    "*": ["class"],
  },
  allowedStyles: {
    "*": {
      "text-align": [/^(left|right|center|justify)$/],
    },
  },
  // Schémas d'URL sûrs uniquement. Bloque `javascript:` / `vbscript:` / `file:`.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    // Les images peuvent être des URLs signées Supabase (https) ou des data:URI.
    img: ["http", "https", "data"],
  },
  allowProtocolRelative: false,
  // Force rel="noopener" sur les liens qui ouvrent un nouvel onglet.
  transformTags: {
    a: (tagName, attribs) => {
      if (attribs.target === "_blank") {
        const rel = new Set((attribs.rel || "").split(/\s+/).filter(Boolean));
        rel.add("noopener");
        rel.add("noreferrer");
        attribs.rel = Array.from(rel).join(" ");
      }
      return { tagName, attribs };
    },
  },
};

/** Nettoie du HTML riche (TipTap/marked) avant rendu public via `set:html`. */
export function cleanRichHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, OPTIONS);
}
