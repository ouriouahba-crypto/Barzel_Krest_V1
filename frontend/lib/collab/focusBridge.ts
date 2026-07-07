// Pont transitoire (lot C3) : le chip d'un objet de discussion demande au dashboard
// de focaliser une maille précise à l'arrivée. La valeur vit au niveau module (elle
// survit à la navigation client) et est consommée UNE seule fois par la page carte.
// Aucune persistance : un rechargement direct de la carte n'en dépend pas, le rendu
// reste identique (au repos, `takePendingFocus()` renvoie null et rien ne change).

export interface PendingFocus {
  citySlug: string;
  zoneId: string;
}

let pending: PendingFocus | null = null;

export function setPendingFocus(citySlug: string, zoneId: string): void {
  pending = { citySlug, zoneId };
}

/** Lit et efface la demande de focus (consommation unique à l'arrivée sur la carte). */
export function takePendingFocus(): PendingFocus | null {
  const p = pending;
  pending = null;
  return p;
}
