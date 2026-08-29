/* =========================================================
   BWEB AGENCE — Notification Telegram (canal interne)
   -----------------------------------------------------------
   Un lead qualifié n'a de valeur que rappelé vite : un score A doit être
   rappelé dans l'heure. L'e-mail arrive dans une boîte qu'on relève quand on y
   pense ; Telegram sonne. C'est donc le canal d'alerte de l'équipe, pas un
   canal client — aucun message n'y part vers un prospect.

   RÈGLE : best-effort strict. Cette fonction ne lève jamais et ne fait jamais
   échouer une soumission. Bot injoignable, jeton absent, réseau coupé : le lead
   est déjà en base, la notification n'est qu'un confort.

   Configuration (Vercel, jamais dans le dépôt) :
     TELEGRAM_BOT_TOKEN — jeton du bot (@godwinhermesbot)
     TELEGRAM_CHAT_ID   — canal destinataire (facultatif, cf. CANAL_PAR_DEFAUT)
   ========================================================= */
import { secret } from "./env";

/* L'identifiant d'un canal n'est pas un secret (il ne donne aucun accès sans le
   jeton du bot) : le laisser en repli évite qu'une variable oubliée fasse taire
   les alertes sans que personne ne s'en aperçoive. */
const CANAL_PAR_DEFAUT = "-1003737557805";

/** Échappe le texte pour le mode `MarkdownV2` de Telegram. */
export function escapeMd(texte: string): string {
  return texte.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => "\\" + c);
}

/**
 * Envoie un message au canal interne. Renvoie `false` si rien n'est parti
 * (non configuré, refus de l'API, réseau) — sans jamais lever.
 */
export async function notifyTelegram(
  texte: string,
  options: { parseMode?: "MarkdownV2" | "HTML"; disablePreview?: boolean } = {},
): Promise<boolean> {
  const token = secret("TELEGRAM_BOT_TOKEN");
  if (!token) return false;
  const chatId = secret("TELEGRAM_CHAT_ID") || CANAL_PAR_DEFAUT;

  try {
    /* Un canal muet ne doit pas non plus retenir la réponse au visiteur : au
       bout de 5 secondes, on abandonne et on rend la main. */
    const stop = AbortSignal.timeout(5000);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: texte,
        parse_mode: options.parseMode ?? "MarkdownV2",
        disable_web_page_preview: options.disablePreview ?? true,
      }),
      signal: stop,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[telegram] notification refusée —", res.status, detail.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] notification non envoyée —", err instanceof Error ? err.message : err);
    return false;
  }
}
