// Le registre de la typographie de l'interface (DESIGN.md, « le carnet d'atelier ») : les familles et une
// echelle de cinq tailles nommees par leur role, pas par leur valeur. Comme les couleurs (jetons.ts,
// ADR-0007), c'est la seule source : la feuille n'ecrit jamais une taille de texte, elle lit une variable,
// et un test le verifie. Pourquoi cinq : un editeur dense veut des pas d'un pixel en bas de l'echelle (12,
// 13, 14), que la couleur et la graisse distinguent, puis deux tailles de titre nettement au-dessus.
//
// Tout est en rem, pour suivre la taille de texte choisie dans le navigateur. Les familles sont celles du
// systeme : la page n'embarque aucune fonte et ne contacte aucun hote pour en charger une.

export interface Taille {
  readonly id: string;
  readonly valeur: string;
  readonly description: string;
}

export const TAILLES: readonly Taille[] = [
  { id: 'texte-petit', valeur: '0.75rem', description: 'Aides, légendes, raccourcis, mesures et codes dans les panneaux, barre d’état (12 px)' },
  { id: 'texte-compact', valeur: '0.8125rem', description: 'Commandes denses : barre d’outils, numéros des vignettes, titres de section (13 px)' },
  { id: 'texte-corps', valeur: '0.875rem', description: 'Le texte courant, les boutons et les champs (14 px)' },
  { id: 'texte-titre', valeur: '1rem', description: 'Titres de panneau et de boîte (16 px)' },
  { id: 'texte-titre-page', valeur: '1.5rem', description: 'Le titre de la page, seul de son rang (24 px)' }
];

export const FAMILLES: ReadonlyArray<readonly [string, string]> = [
  ['sans', 'system-ui, "Segoe UI", "Helvetica Neue", Arial, sans-serif'],
  ['mono', 'ui-monospace, Menlo, Consolas, monospace']
];

/** Les declarations de la typographie, a poser dans le :root des jetons. */
export function declarationsTypographie(retrait: string): string {
  return [...FAMILLES.map(([id, pile]) => retrait + '--' + id + ': ' + pile + ';'), ...TAILLES.map(t => retrait + '--' + t.id + ': ' + t.valeur + ';')].join('\n');
}

/** La table de docs/jetons.md pour la typographie. */
export function tableauTypographie(): string {
  const lignes = TAILLES.map(t => '| `--' + t.id + '` | `' + t.valeur + '` | ' + t.description + ' |');
  return ['### La typographie : cinq tailles nommées par leur rôle', '', '| Jeton | Valeur | Rôle |', '|---|---|---|', ...lignes].join('\n');
}
