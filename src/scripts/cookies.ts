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
 * @param autoShow  Vrai partout, sauf sur les landings de vente : la bannière
 *   s'y ouvrait au-dessus du CTA, au moment précis où le visiteur décide.
 * @param delaiMs   Sur ces mêmes landings, la bannière n'est pas supprimée mais
 *   RETARDÉE : elle s'affiche une fois le visiteur installé dans la page, assez
 *   tard pour ne plus rien couvrir au moment du choix, assez tôt pour qu'il
 *   puisse encore accepter — et donc pour que le pixel, jusque-là muet, envoie
 *   enfin la file d'événements qu'il a gardée depuis la première seconde.
 */
export function initCookies(autoShow = true, delaiMs = 0): void {
  // Exposé pour les boutons hors de ce bundle (ex. « Afficher la carte »).
  window.bwebCookies = {
    show: () => CookieConsent.showPreferences(),
    acceptExternes: () => CookieConsent.acceptCategory(["necessary", "externes"]),
  };

  /* Le retard se pilote ici, pas dans la librairie : `autoShow` est coupé, et
     on rouvre nous-mêmes après le délai — mais seulement si le visiteur n'a
     pas déjà répondu entre-temps (il a pu ouvrir le panneau depuis le pied de
     page, ou avoir choisi lors d'une visite précédente). */
  const differe = autoShow && delaiMs > 0;
  CookieConsent.run({
    autoShow: autoShow && !differe,
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
              "Ce site utilise des cookies techniques nécessaires à son fonctionnement. Avec votre accord, nous affichons aussi des contenus externes, comme la carte Google Maps de notre localisation et les témoignages vidéo de nos clients.",
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
                title: "Contenus externes (cartes, vidéos)",
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

  if (differe) {
    window.setTimeout(() => {
      // `validConsent()` est vrai dès que le visiteur a tranché, ici ou ailleurs.
      if (!CookieConsent.validConsent()) CookieConsent.show();
    }, delaiMs);
  }
}
