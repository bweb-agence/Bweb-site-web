/* =========================================================
   Lecture des secrets côté serveur — À L'EXÉCUTION.
   -----------------------------------------------------------
   Volontairement `process.env` d'abord, et non `import.meta.env` : ce dernier
   est remplacé par sa VALEUR à la compilation. Si la variable manque au moment
   du build, Vite écrit `undefined` et l'élimination de code mort supprime le
   bloc qui en dépend — la route répond « non configuré » pour toujours, même
   une fois la variable renseignée dans Vercel, et il faut redéployer pour s'en
   apercevoir. En prime, `import.meta.env` inscrit la clé en clair dans
   l'artefact déployé. (Incident vécu sur le tunnel webinaire, PR #92/#93.)

   `import.meta.env` reste consulté en second, en accès DYNAMIQUE — Vite ne
   remplace que les accès littéraux (`import.meta.env.FOO`), donc une clé
   variable échappe à l'inlining et au code mort. C'est ce qui fait marcher le
   test en local : `astro dev` charge les fichiers `.env` dans `import.meta.env`
   et non dans `process.env`.

   Plusieurs noms acceptés : le premier renseigné gagne. Permet de renommer une
   variable dans Vercel sans casser la production entre-temps.
   ========================================================= */

/** Valeur d'un secret serveur, résolue à l'exécution. Chaîne vide si absent. */
export function secret(...noms: string[]): string {
  const runtime = globalThis.process?.env ?? {};
  // `?? {}` : hors Vite (test unitaire en Node nu), `import.meta.env` n'existe
  // pas — sans ce filet, la lecture de la clé suivante lèverait.
  const build = (import.meta.env ?? {}) as Record<string, string | undefined>;
  for (const nom of noms) {
    const valeur = runtime[nom] || build[nom];
    if (valeur && valeur !== "A_COMPLETER") return valeur;
  }
  return "";
}
