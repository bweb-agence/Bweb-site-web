/* =========================================================
   BWEB AGENCE — Consentement cookies
   Librairie open-source auto-hébergée : vanilla-cookieconsent (aucun compte,
   aucun service externe). Deux catégories : cookies techniques nécessaires +
   contenus externes (carte Google Maps).

   Au consentement, on pose la classe `consent-externes` sur <html> et on émet
   l'événement `bweb:consent` : les intégrations tierces (ex. la carte de la page
   Location de salle) s'activent alors, et restent masquées sinon.
   ========================================================= */
import "vanilla-cookieconsent/dist/cookieconsent.css";
import "../styles/cookies.css";
import * as CookieConsent from "vanilla-cookieconsent";

declare global {
  interface Window {
    bwebCookies?: { show: () => void; acceptExternes: () => void };
  }
}

function applyConsent(): void {
  const ok = CookieConsent.acceptedCategory("externes");
  document.documentElement.classList.toggle("consent-externes", ok);
  window.dispatchEvent(new CustomEvent("bweb:consent", { detail: { externes: ok } }));
}

/**
 * @param autoShow  Faux sur les landings de vente et les pages d'inscription :
 *   la bannière s'y ouvrait au-dessus du CTA, au moment précis où le visiteur
 *   décide. On charge quand même la librairie — le choix déjà exprimé ailleurs
 *   continue de s'appliquer, le bouton « Gérer les cookies » du pied de page
 *   ouvre toujours le panneau, et rien ne se règle en douce derrière le dos du
 *   visiteur : la bannière est seulement silencieuse, pas absente.
 */
export function initCookies(autoShow = true): void {
  // Exposé pour les boutons hors de ce bundle (ex. « Afficher la carte »).
  window.bwebCookies = {
    show: () => CookieConsent.showPreferences(),
    acceptExternes: () => CookieConsent.acceptCategory(["necessary", "externes"]),
  };

  CookieConsent.run({
    autoShow,
    guiOptions: {
      consentModal: { layout: "box wide", position: "bottom left", flipButtons: false, equalWeightButtons: true },
      preferencesModal: { layout: "box", position: "right", flipButtons: false, equalWeightButtons: true },
    },
    categories: {
      necessary: { enabled: true, readOnly: true },
      externes: {},
    },
    language: {
      default: "fr",
      translations: {
        fr: {
          consentModal: {
            title: "Nous respectons votre vie privée",
            description:
              "Ce site utilise des cookies techniques nécessaires à son fonctionnement. Avec votre accord, nous affichons aussi des contenus externes, comme la carte Google Maps de notre localisation.",
            acceptAllBtn: "Tout accepter",
            acceptNecessaryBtn: "Refuser",
            showPreferencesBtn: "Personnaliser",
            footer:
              '<a href="/politique-confidentialite">Politique de confidentialité</a><a href="/mentions-legales">Mentions légales</a>',
          },
          preferencesModal: {
            title: "Préférences de confidentialité",
            acceptAllBtn: "Tout accepter",
            acceptNecessaryBtn: "Refuser",
            savePreferencesBtn: "Enregistrer mes choix",
            closeIconLabel: "Fermer",
            sections: [
              {
                title: "Cookies nécessaires",
                description: "Indispensables au bon fonctionnement du site. Toujours actifs.",
                linkedCategory: "necessary",
              },
              {
                title: "Contenus externes (cartes)",
                description:
                  "Autorise l'affichage de la carte Google Maps de notre localisation. Google est susceptible de déposer ses propres cookies.",
                linkedCategory: "externes",
              },
              {
                title: "En savoir plus",
                description:
                  'Pour toute question, consultez notre <a href="/politique-confidentialite">politique de confidentialité</a>.',
              },
            ],
          },
        },
      },
    },
    onFirstConsent: applyConsent,
    onConsent: applyConsent,
    onChange: applyConsent,
  });
}
