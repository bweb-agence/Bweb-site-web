# Design system — composants UI

Composants `.astro` réutilisables de l'admin Bweb. Ils **enveloppent les classes
existantes** (`admin.css`) : aucune régression visuelle, adoption progressive.

**Fondations** : `src/styles/tokens.css` (couleurs, typo, espace, rayons, ombres,
motion, z-index). **Doc vivante** : `/admin/styleguide`.

## Composants

| Composant | Rôle | Props clés |
|-----------|------|-----------|
| `Button` | Bouton (`<a>` ou `<button>`) | `variant` (default·primary·wa·danger·ghost), `size` (md·sm), `href` |
| `Badge` | Pastille de statut | `variant` (ok·wait·pub·draft·full·client·prospect·relance), `dot` |
| `KpiCard` | Carte KPI (bandeau) | `accent` (green·blue·navy·violet·amber), `label`, `value` + slot `icon` |
| `StatTile` | Tuile stat simple | `label`, `value`, `tone` (ok·warn) |
| `Panel` | Carte de contenu | `title` + slot `actions` |
| `Field` | Champ de formulaire | `label`, `hint`, `for` |
| `Drawer` | Tiroir latéral | `id`, `title` + slot `foot` — ouverture via `data-drawer-open="<id>"` |

## Exemple

```astro
---
import Button from "../../components/ui/Button.astro";
import Panel from "../../components/ui/Panel.astro";
---
<Panel title="Réservations">
  <Button slot="actions" size="sm" href="/admin/reservations">Tout voir</Button>
  …
</Panel>
```

> Le rendu HTML client-side (via `innerHTML` dans les scripts) continue d'utiliser
> les **classes** directement (`.abtn`, `.tag-pill`…). Les composants servent au
> markup `.astro` statique. Les deux partagent la même feuille de style.
