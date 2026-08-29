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

/* Mesure d'audience publicitaire. Le pixel couvre TOUT le site depuis le
   21/08/2026 (l'ancien, 150267587094280, ne servait que les tunnels de vente).
   Le même identifiant doit être renseigné dans META_PIXEL_ID côté serveur pour
   que l'API Conversions alimente le même pixel. */
export const tracking = {
  metaPixelId: "4342601752668466",
  /* Hôtes autorisés à déclencher le pixel. Sans ce garde-fou, ouvrir une page
     depuis `localhost` pendant un développement envoie de VRAIS événements au
     pixel de production : c'est ainsi qu'un `Purchase` fantôme s'est retrouvé
     dans les conversions le 20/08/2026, en ouvrant simplement la page de
     bienvenue du parcours. Les préproductions Vercel (*.vercel.app) sont
     exclues pour la même raison. */
  metaPixelHosts: ["bwebagence.com", "www.bwebagence.com"],
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

export type Service = {
  label: string;
  href: string;
  description: string;
  /** Markup interne d'un <svg viewBox="0 0 24 24"> (voir Header.astro). */
  icon: string;
  image?: string;
};

/* Services (source unique — utilisée par le mega menu du header et le footer). */
export const services: Service[] = [
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
  {
    label: "Location de salle",
    href: "/services-location-salle",
    description: "Salle équipée à louer pour formations et événements.",
    icon: '<rect x="3" y="4" width="18" height="11" rx="1.5"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>',
    image: "/images/salle/salle-hero.webp",
  },
];

/* =========================================================
   MÉGA-MENU
   -----------------------------------------------------------
   Les colonnes ne reprennent PAS l'organigramme de l'agence : elles rangent
   les offres par ce que le dirigeant vient chercher — décider, construire,
   vendre. C'est la seule question qu'il se pose en ouvrant le menu.

   Trois règles d'écriture, tenues dans tout ce qui suit :
     • le lien porte le NOM, la ligne dessous dit ce que c'est — jamais un
       adjectif publicitaire ;
     • aucun prix. Le menu sert à s'orienter, pas à vendre : un montant y
       arrête la lecture avant que l'offre soit comprise (décision Godwin du
       29/08/2026) ;
     • une offre sans page porte `bientot` et n'est PAS un lien. Annoncer la
       suite du catalogue, oui ; envoyer sur un 404, jamais.
   ========================================================= */

export type MenuBadge = "nouveau" | "bientot" | "boutique";

export type MenuLien = {
  label: string;
  /** Absent = offre annoncée mais pas encore ouverte : rendue non cliquable. */
  href?: string;
  description?: string;
  badge?: MenuBadge;
  externe?: boolean;
};

export type MenuColonne = {
  /** Intitulé de la colonne. Dit un résultat, pas un service. */
  titre: string;
  /** « editorial » : liens en gros caractères, sans description (colonne 1). */
  style?: "editorial";
  liens: MenuLien[];
};

export type MegaMenu = {
  colonnes: MenuColonne[];
  /** L'unique action mise en avant du panneau. */
  carte: { titre: string; texte: string; cta: string; href: string };
  pied?: { intro: string; liens: MenuLien[] };
};

/* Reprend le libellé et l'URL depuis `services` : le menu ne peut donc pas
   afficher un nom périmé ni pointer vers une page renommée. Seule la
   description est propre au menu — elle y est plus courte et plus concrète
   que sur les cartes de la page /services. */
function offre(href: string, description: string, badge?: MenuBadge): MenuLien {
  const service = services.find((s) => s.href === href);
  if (!service) throw new Error(`[site.ts] service introuvable pour le menu : ${href}`);
  return { label: service.label, href: service.href, description, badge };
}

export const megaServices: MegaMenu = {
  colonnes: [
    {
      titre: "L'essentiel",
      style: "editorial",
      liens: [
        { label: "Tous nos services", href: "/services" },
        { label: "Notre méthode", href: "/methodologie" },
        { label: "Nos réalisations", href: "/realisations" },
      ],
    },
    {
      titre: "Décider quoi faire",
      liens: [
        offre("/services-conseil-strategie", "Diagnostic, feuille de route, priorités"),
        {
          label: "Atelier Stratégie IA",
          href: "/atelier-strategie-ia",
          description: "Une journée pour les dirigeants de PME",
          badge: "nouveau",
        },
        /* Les deux étages suivants de l'entonnoir. Ils n'ont pas encore de page :
           annoncés, grisés, non cliquables — jusqu'à ce qu'un `href` arrive. */
        { label: "Mission Clarté", description: "Le diagnostic complet de votre entreprise", badge: "bientot" },
        { label: "Directeur Digital & IA", description: "Un expert à vos côtés, tous les mois", badge: "bientot" },
      ],
    },
    {
      titre: "Construire vos outils",
      liens: [
        offre("/services-creation-saas", "Plateformes et outils pensés pour vendre"),
        offre("/services-digitalisation", "Sites, boutiques, process en ligne"),
        offre("/services-automatisation-ia", "Agents IA, WhatsApp, relances automatiques"),
      ],
    },
    {
      titre: "Vendre & former",
      liens: [
        offre("/services-marketing-digital", "Contenus et acquisition de clients"),
        offre("/services-formation", "Vos équipes autonomes sur l'IA"),
        offre("/services-location-salle", "Salle équipée à Cocody Riviera Abatta"),
      ],
    },
  ],
  carte: {
    titre: "Vous ne savez pas par où commencer ?",
    texte: "Quinze minutes au téléphone, et vous repartez avec une direction claire — sans engagement.",
    cta: "Réserver un appel",
    href: "/atelier-strategie-ia#reservation",
  },
  pied: {
    intro: "Vous cherchez autre chose ?",
    liens: [
      { label: "Demander un devis", href: "/devis" },
      { label: "Nous contacter", href: "/contact" },
    ],
  },
};

export const megaFormations: MegaMenu = {
  colonnes: [
    {
      titre: "Se former avec Bweb",
      style: "editorial",
      liens: [
        { label: "Toutes les formations", href: "/formations" },
        { label: "Le calendrier", href: "/formations/calendrier" },
      ],
    },
    {
      titre: "En présentiel à Abidjan",
      liens: [
        { label: "Prochaines sessions", href: "/formations/calendrier", description: "Dates ouvertes et places restantes" },
        {
          label: "Atelier Stratégie IA",
          href: "/atelier-strategie-ia",
          description: "Réservé aux dirigeants de PME",
          badge: "nouveau",
        },
        offre("/services-formation", "Chez vous, pour vos équipes"),
      ],
    },
    {
      titre: "En ligne",
      liens: [
        {
          label: "Bweb Academy",
          href: "https://boutique.bwebagence.com",
          description: "Nos cours à suivre à votre rythme",
          badge: "boutique",
          externe: true,
        },
        { label: "Webinaire gratuit", href: "/webinaire-initiation", description: "Notre prochain rendez-vous en direct" },
      ],
    },
  ],
  carte: {
    titre: "Former toute une équipe ?",
    texte: "Nous construisons le programme sur vos outils et vos cas réels.",
    cta: "Demander un programme",
    href: "/devis",
  },
};

/* Navigation principale */
type NavLink = { label: string; href: string; mega?: MegaMenu };

export const mainNav: NavLink[] = [
  { label: "Accueil", href: "/" },
  { label: "À propos", href: "/a-propos" },
  { label: "Services", href: "/services", mega: megaServices },
  { label: "Formations", href: "/formations", mega: megaFormations },
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
