/* =========================================================
   BWEB AGENCE — Configuration centrale du site
   Source unique de vérité : coordonnées, navigation, contact.
   Modifier ici met à jour tout le site (header, footer, formulaires).
   ========================================================= */

export const site = {
  name: "Bweb Agence",
  legalName: "Bweb Agence",
  tagline: "Conseil, formation et transformation digitale en Afrique",
  description:
    "Bweb Agence accompagne entrepreneurs, PME et organisations dans leur transformation digitale : conseil stratégique, création de sites web, marketing digital, automatisation & IA, formation professionnelle.",
  url: "https://www.bwebagence.com",
  locale: "fr_FR",
  lang: "fr",
  // Image de partage social (1200x630, JPEG — WhatsApp/Facebook ne rendent pas le SVG).
  ogImage: "/images/og-cover.jpg",
};

export const contact = {
  email: "info@bwebagence.com",
  // Numéros WhatsApp au format international SANS le "+".
  whatsapp: {
    primary: "2250701926028",
    secondary: "2250576792525",
  },
  // Affichage lisible (dérivé, modifiable librement).
  phoneDisplay: "+225 07 01 92 60 28",
  phoneDisplaySecondary: "+225 05 76 79 25 25",
  address: {
    city: "Abidjan",
    country: "Côte d'Ivoire",
    hours: "Lun – Ven, 8h30 – 18h00",
  },
  social: {
    facebook: "",
    instagram: "",
    linkedin: "",
  },
};

/* Endpoint e-mail (Formspree ou compatible) qui relaie les formulaires
   vers contact.email. Laisser vide désactive proprement l'envoi e-mail :
   le formulaire bascule alors uniquement sur WhatsApp.

   Par défaut, on utilise FormSubmit (https://formsubmit.co) : AUCUN compte ni
   clé API. Les demandes sont envoyées à contact.email. IMPORTANT : au tout
   premier envoi après mise en ligne, FormSubmit envoie un e-mail de
   confirmation à info@bwebagence.com — cliquer le lien une seule fois pour
   activer la réception. (Alternative : coller un ID Formspree ci-dessous pour
   passer par Formspree à la place.) */
export const forms = {
  provider: "formsubmit" as "formsubmit" | "formspree",
  formspreeId: "", // optionnel : bascule sur Formspree si renseigné
  get emailEndpoint() {
    if (this.formspreeId) return `https://formspree.io/f/${this.formspreeId}`;
    if (this.provider === "formsubmit") return `https://formsubmit.co/ajax/${contact.email}`;
    return "";
  },
};

/* Navigation principale */
export const mainNav = [
  { label: "Accueil", href: "/" },
  { label: "À propos", href: "/a-propos" },
  { label: "Services", href: "/services" },
  { label: "Réalisations", href: "/realisations" },
  { label: "Formations", href: "/formations" },
];

export const navCta = [
  { label: "Nous contacter", href: "/contact", variant: "btn-outline" },
  { label: "Demander un devis", href: "/devis", variant: "btn-primary" },
];

/* Colonnes du footer */
export const footerNav = {
  navigation: [
    { label: "À propos", href: "/a-propos" },
    { label: "Services", href: "/services" },
    { label: "Réalisations", href: "/realisations" },
    { label: "Formations", href: "/formations" },
    { label: "Méthodologie", href: "/methodologie" },
    { label: "Contact", href: "/contact" },
  ],
  services: [
    { label: "Conseil & stratégie", href: "/services-conseil-strategie" },
    { label: "Création de sites web", href: "/services-creation-sites-web" },
    { label: "Marketing digital", href: "/services-marketing-digital" },
    { label: "Digitalisation", href: "/services-digitalisation" },
    { label: "Automatisation & IA", href: "/services-automatisation-ia" },
    { label: "Formation professionnelle", href: "/services-formation" },
  ],
  legal: [
    { label: "Mentions légales", href: "/mentions-legales" },
    { label: "Politique de confidentialité", href: "/politique-confidentialite" },
    { label: "Conditions générales", href: "/conditions-generales" },
  ],
};

/* Lien WhatsApp prêt à l'emploi (numéro principal) */
export function whatsappLink(
  message = "Bonjour Bweb Agence, je souhaite en savoir plus sur vos services.",
  number: string = contact.whatsapp.primary,
) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
