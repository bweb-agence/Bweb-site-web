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
    "Bweb Agence accompagne entrepreneurs, PME et organisations dans leur transformation digitale : conseil stratégique, création de SaaS, marketing digital, automatisation & IA, formation professionnelle.",
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

/* Services (source unique — utilisée par le mega menu du header et le footer).
   `icon` : markup interne d'un <svg viewBox="0 0 24 24"> (voir Header.astro). */
export const services = [
  {
    label: "Conseil & stratégie",
    href: "/services-conseil-strategie",
    description: "Diagnostic, feuille de route et priorités claires.",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7c2.5 2.6 4 5.8 4 5s-1.5-2.4-4-5c-2.5 2.6-4 4.2-4 5s1.5-2.4 4-5z"/><path d="M14.5 9.5 12 12l-2.5 2.5L12 12l2.5-2.5z" fill="currentColor" stroke="none"/>',
  },
  {
    label: "Création de SaaS",
    href: "/services-creation-saas",
    description: "Plateformes et outils SaaS pensés pour vendre.",
    icon: '<path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z"/><path d="M4 12l8 4.5 8-4.5"/><path d="M4 16.5l8 4.5 8-4.5"/>',
  },
  {
    label: "Marketing digital",
    href: "/services-marketing-digital",
    description: "Contenus et acquisition qui font vendre en ligne.",
    icon: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  },
  {
    label: "Digitalisation",
    href: "/services-digitalisation",
    description: "Sites, boutiques et process digitalisés.",
    icon: '<rect x="3" y="4" width="18" height="14" rx="2"/><line x1="3" y1="8.5" x2="21" y2="8.5"/><circle cx="6" cy="6.2" r=".7" fill="currentColor" stroke="none"/><line x1="9" y1="21" x2="15" y2="21"/>',
  },
  {
    label: "Automatisation & IA",
    href: "/services-automatisation-ia",
    description: "Agents IA et automatisations qui font gagner du temps.",
    icon: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><line x1="12" y1="1.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22.5" y2="12"/>',
  },
  {
    label: "Formation professionnelle",
    href: "/services-formation",
    description: "Équipes formées, autonomes sur l'IA et le digital.",
    icon: '<path d="M2 9l10-5 10 5-10 5L2 9z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/><line x1="22" y1="9" x2="22" y2="15"/>',
  },
];

/* Navigation principale */
type NavLink = { label: string; href: string; children?: typeof services };

export const mainNav: NavLink[] = [
  { label: "Accueil", href: "/" },
  { label: "À propos", href: "/a-propos" },
  { label: "Services", href: "/services", children: services },
  { label: "Réalisations", href: "/realisations" },
  { label: "Formations", href: "/formations" },
  { label: "Blog", href: "/blog" },
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
    { label: "Blog", href: "/blog" },
    { label: "Méthodologie", href: "/methodologie" },
    { label: "Contact", href: "/contact" },
  ],
  services,
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
