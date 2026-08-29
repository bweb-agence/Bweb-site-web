/* =========================================================
   BWEB AGENCE — Score de qualification « Atelier Stratégie IA »
   -----------------------------------------------------------
   Barème du scope §6. Isolé ici, SANS aucune dépendance (ni Astro, ni
   Supabase, ni réseau) : c'est ce qui rend la règle vérifiable en une commande
   plutôt qu'en envoyant un vrai lead dans la base et une vraie notification à
   l'équipe.

   Le score est calculé côté SERVEUR uniquement. Le formulaire n'en poste
   aucun, et un score posté serait ignoré — sans quoi n'importe qui pourrait se
   déclarer « A » et passer devant la file de rappel.

   Quatre critères à 2 points + 2 points de douleur = 10 au maximum.
   A (8-10) : rappel sous 1 h · B (5-7) : sous 24 h · C (0-4) : nurturing.
   ========================================================= */

/** La cible de l'atelier : la PME établie, avec équipe et process en place. */
const GRANDES_TAILLES = ["10 à 49 employés", "50 à 100 employés"];
/** Seul un décideur peut engager 200 000 FCFA au téléphone. */
const ROLES_DECIDEURS = ["Dirigeant·e", "Associé·e"];
/* « À définir ensemble » est volontairement ABSENT : c'est une non-réponse, et
   la compter comme un budget haut ferait remonter en tête de file des dossiers
   qu'on ne peut pas encore qualifier. */
const BUDGETS_HAUTS = ["500 000 à 1 000 000 FCFA", "1 à 5 millions FCFA", "Plus de 5 millions FCFA"];

/** Nombre de douleurs retenues au maximum (le formulaire en propose 2). */
export const MAX_DOULEURS = 2;

export type NiveauQualification = "A" | "B" | "C";

export interface Qualification {
  score: number;
  niveau: NiveauQualification;
  /** Délai de rappel associé, repris tel quel dans l'e-mail et sur Telegram. */
  delai: string;
}

export interface ChampsQualification {
  company_size?: string;
  role?: string;
  past_invest?: string;
  budget?: string;
  pain?: string[];
}

export function calculerScore(champs: ChampsQualification): Qualification {
  let score = 0;

  // Taille de l'entreprise.
  score += GRANDES_TAILLES.includes(champs.company_size || "") ? 2 : 1;

  // Rôle du demandeur.
  score += ROLES_DECIDEURS.includes(champs.role || "") ? 2 : 1;

  /* Expérience : un dirigeant déjà déçu par le digital est le MEILLEUR profil —
     il a déjà payé, il sait ce qu'il ne veut plus, et il cherche de la clarté. */
  score += champs.past_invest === "Oui, sans résultats convaincants" ? 2 : 1;

  // Budget.
  score += BUDGETS_HAUTS.includes(champs.budget || "") ? 2 : 1;

  // Douleur : un point par case cochée, plafonné.
  score += Math.min(champs.pain?.length ?? 0, MAX_DOULEURS);

  if (score >= 8) return { score, niveau: "A", delai: "Rappel sous 1 h (WhatsApp direct)" };
  if (score >= 5) return { score, niveau: "B", delai: "Rappel sous 24 h" };
  return { score, niveau: "C", delai: "Nurturing e-mail, pas de rappel prioritaire" };
}
