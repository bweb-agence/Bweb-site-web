/* Nœud « Encadré » (callout façon Notion) pour TipTap.
   Bloc conteneur qui peut contenir des paragraphes/listes.
   Rendu : <div class="callout" data-callout>…</div> (icône via CSS).
   Utilisé avec les commandes natives wrapIn/toggleWrap('callout'). */
import { Node, mergeAttributes } from "@tiptap/core";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "div.callout" }, { tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "callout", "data-callout": "" }), 0];
  },

  addKeyboardShortcuts() {
    return { "Mod-Shift-e": () => this.editor.chain().focus().toggleWrap(this.name).run() };
  },
});
