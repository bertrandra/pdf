// Le registre des jetons de couleur de l'interface (ADR-0004) : la seule source des couleurs de la page.
// Chaque jeton a un identifiant, un role, une valeur claire et une valeur sombre, et dit a quoi il sert.
// Le CSS des variables se genere d'ici (`cssJetons`, au build) ; la page n'en ecrit aucune a la main, et un test
// confronte le registre au CSS : pas de couleur en dur, pas de jeton orphelin, pas de paire texte-fond sous 4,5:1.
// Les valeurs sont celles de l'editeur svg, pour que les deux outils se reconnaissent. La page n'emploie pas
// color-mix() : chaque teinte melangee est un jeton calcule ici, valable dans tous les navigateurs.

import { contraste, lireHex } from '../util/couleur.js';
import { declarationsEspaces, tableauEspaces } from './espaces.js';
import { declarationsTypographie, tableauTypographie } from './typographie.js';

export type RoleJeton = 'surface' | 'texte' | 'trait' | 'action' | 'etat' | 'feuille' | 'relief';
export type Theme = 'clair' | 'sombre';

export interface Jeton {
  /** Le nom de la variable CSS, sans les deux tirets : `cyan` donne `--cyan`. */
  readonly id: string;
  readonly role: RoleJeton;
  readonly clair: string;
  readonly sombre: string;
  readonly description: string;
}

/** Les roles dans l'ordre ou on les lit, avec ce qu'ils regroupent. */
export const ROLES: ReadonlyArray<readonly [RoleJeton, string]> = [
  ['surface', 'Les fonds : la table de travail et les panneaux'],
  ['texte', 'Les encres : le texte et ses nuances'],
  ['trait', 'Les filets et séparations'],
  ['action', 'La couleur d’outil : une seule, pour l’action, la sélection et le focus'],
  ['etat', 'Les messages : avertissement et échec, chacun avec son fond'],
  ['feuille', 'Ce qui se voit derrière une page : le papier en attente de son aperçu'],
  ['relief', 'Les ombres et voiles, translucides']
];

const jeton = (id: string, role: RoleJeton, clair: string, sombre: string, description: string): Jeton => ({ id, role, clair, sombre, description });

export const JETONS: readonly Jeton[] = [
  jeton('table', 'surface', '#e9ecef', '#121518', 'Le fond de la page et de la grille de vignettes'),
  jeton('panneau', 'surface', '#f7f8f9', '#1a1e22', 'Les barres, panneaux, cartes et boîtes : ce qui se pose sur la table'),
  jeton('selection', 'surface', '#c6dde6', '#2a4b5a', 'Le fond d’une vignette choisie, et du texte sélectionné'),
  jeton('survol', 'surface', '#dfe9ee', '#20313a', 'Le fond d’un bouton discret ou d’une vignette survolés : la couleur d’outil à peine posée'),
  jeton('encre', 'texte', '#15181d', '#e6e9ec', 'Le texte courant et les icônes'),
  jeton('encre-douce', 'texte', '#555c66', '#9aa3ad', 'Le texte secondaire : aides, légendes, numéros de page'),
  jeton('filet', 'trait', '#cfd4da', '#2f353c', 'Les bordures et séparations ; décoratif, il ne porte jamais seul une information'),
  jeton('filet-fort', 'trait', '#7d848d', '#69717b', 'Le bord qui doit se voir : contour d’une vignette, curseur du zoom'),
  jeton('cyan', 'action', '#00719c', '#4fb3dc', 'La couleur d’outil : action primaire, sélection, focus, repère d’insertion'),
  jeton('cyan-fonce', 'action', '#006186', '#71c3e4', 'L’action primaire survolée'),
  jeton('sur-cyan', 'action', '#ffffff', '#08202b', 'Le texte posé sur la couleur d’outil'),
  jeton('alerte', 'etat', '#8a5a00', '#e3b45a', 'Avertissement : le texte'),
  jeton('alerte-fond', 'etat', '#f8ecd2', '#33280f', 'Avertissement : le fond du message'),
  jeton('echec', 'etat', '#a8322a', '#f08b80', 'Échec et geste destructif : le texte et le contour'),
  jeton('echec-fond', 'etat', '#f7e0dd', '#3a1c19', 'Échec : le fond du message'),
  jeton('papier', 'feuille', '#ffffff', '#ffffff', 'Le papier d’une page, avant et sous son aperçu : blanc dans les deux thèmes, comme une feuille'),
  jeton('ombre', 'relief', 'rgba(0, 0, 0, 0.18)', 'rgba(0, 0, 0, 0.5)', 'L’ombre portée d’une page'),
  jeton('voile', 'relief', 'rgba(0, 0, 0, 0.45)', 'rgba(0, 0, 0, 0.6)', 'Le voile derrière l’aperçu en grand et les boîtes')
];

/** Un texte sur un fond : le contraste minimal qu'il doit tenir dans les deux thèmes. */
export interface PaireContraste { readonly texte: string; readonly fond: string; readonly minimum: number; readonly usage: string }

/** WCAG 2.x AA, texte courant : 4,5:1. */
export const AA = 4.5;
/** WCAG 2.x 1.4.11, ce qui n'est pas du texte (le bord d'une commande, une forme qui informe) : 3:1. */
export const AA_GRAPHIQUE = 3;

export const PAIRES: readonly PaireContraste[] = [
  { texte: 'encre', fond: 'table', minimum: AA, usage: 'texte sur la page' },
  { texte: 'encre', fond: 'panneau', minimum: AA, usage: 'texte dans les panneaux' },
  { texte: 'encre', fond: 'selection', minimum: AA, usage: 'numéro d’une vignette choisie' },
  { texte: 'encre', fond: 'survol', minimum: AA, usage: 'bouton discret survolé' },
  { texte: 'encre-douce', fond: 'table', minimum: AA, usage: 'numéros de page et aides sur la page' },
  { texte: 'encre-douce', fond: 'panneau', minimum: AA, usage: 'aides dans les panneaux' },
  { texte: 'cyan', fond: 'panneau', minimum: AA, usage: 'liens et état actif dans les panneaux' },
  { texte: 'cyan', fond: 'table', minimum: AA, usage: 'liens sur la page' },
  { texte: 'sur-cyan', fond: 'cyan', minimum: AA, usage: 'libellé de l’action primaire' },
  { texte: 'sur-cyan', fond: 'cyan-fonce', minimum: AA, usage: 'libellé de l’action primaire survolée' },
  { texte: 'alerte', fond: 'alerte-fond', minimum: AA, usage: 'message d’avertissement' },
  { texte: 'echec', fond: 'echec-fond', minimum: AA, usage: 'message d’échec' },
  { texte: 'echec', fond: 'panneau', minimum: AA, usage: 'geste destructif au repos' }
];

/** Les bords qui portent une information : 3:1 contre leur fond, dans les deux thèmes. */
export const PAIRES_GRAPHIQUES: readonly PaireContraste[] = [
  { texte: 'filet-fort', fond: 'panneau', minimum: AA_GRAPHIQUE, usage: 'contour d’un champ, curseur du zoom' },
  { texte: 'cyan', fond: 'table', minimum: AA_GRAPHIQUE, usage: 'contour d’une vignette choisie, repère d’insertion' },
  { texte: 'cyan', fond: 'selection', minimum: AA_GRAPHIQUE, usage: 'contour d’une vignette choisie contre son propre fond' }
];

const parId = new Map(JETONS.map(j => [j.id, j] as const));

/** Le jeton d'un identifiant, ou une erreur qui le nomme : une faute de frappe ne passe pas en silence. */
export function lire(id: string): Jeton {
  const j = parId.get(id);
  if (!j) throw new Error('Jeton de couleur inconnu : « ' + id + ' »');
  return j;
}

/** Le contraste d'une paire dans un thème ; les deux jetons doivent être des couleurs opaques en hexadécimal. */
export function contrasteDe(p: PaireContraste, theme: Theme): number {
  const t = lireHex(lire(p.texte)[theme]), f = lireHex(lire(p.fond)[theme]);
  if (!t || !f) throw new Error('Paire non hexadécimale : ' + p.texte + ' sur ' + p.fond);
  return contraste(t, f);
}

const declarations = (jetons: readonly Jeton[], theme: Theme, retrait: string): string =>
  jetons.map(j => retrait + '--' + j.id + ': ' + j[theme] + ';').join('\n');

/**
 * Le CSS des variables : le thème clair par défaut, le sombre quand le système le demande (sauf si la page force
 * « clair »), et le sombre quand la page le force. Seuls les jetons qui changent figurent dans les blocs sombres.
 */
export function cssJetons(): string {
  const changent = JETONS.filter(j => j.clair !== j.sombre);
  return [
    '/* Généré depuis src/styles/jetons.ts : ne pas modifier ici. */',
    ':root {',
    declarations(JETONS, 'clair', '  '),
    declarationsTypographie('  '),
    declarationsEspaces('  '),
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    declarations(changent, 'sombre', '    '),
    '    color-scheme: dark;',
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    declarations(changent, 'sombre', '  '),
    '  color-scheme: dark;',
    '}'
  ].join('\n');
}

const cellule = (v: string) => '`' + v + '`';

/** La table de docs/jetons.md : un tableau par rôle, puis les paires de contraste avec leur rapport réel. */
export function tableauJetons(): string {
  const sections = ROLES.map(([role, titre]) => {
    const lignes = JETONS.filter(j => j.role === role).map(j => '| ' + cellule('--' + j.id) + ' | ' + cellule(j.clair) + ' | ' + cellule(j.sombre) + ' | ' + j.description + ' |');
    return ['### ' + titre, '', '| Jeton | Clair | Sombre | Rôle |', '|---|---|---|---|', ...lignes].join('\n');
  });
  const ligne = (p: PaireContraste) => '| ' + cellule('--' + p.texte) + ' sur ' + cellule('--' + p.fond) + ' | ' + contrasteDe(p, 'clair').toFixed(2) + ' | ' + contrasteDe(p, 'sombre').toFixed(2) + ' | ' + p.usage + ' |';
  const tableContrastes = (titre: string, paires: readonly PaireContraste[]) => [titre, '', '| Paire | Clair | Sombre | Usage |', '|---|---|---|---|', ...paires.map(ligne)].join('\n');
  return [
    '# Les jetons de l’interface',
    '',
    'Généré depuis `src/styles/` par `ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles` : ne pas modifier à la main.',
    '',
    ...sections.flatMap(s => [s, '']),
    tableContrastes('### Contrastes exigés (WCAG 2.x AA, au moins ' + AA + ':1)', PAIRES),
    '',
    tableContrastes('### Contrastes exigés hors texte (WCAG 2.x 1.4.11, au moins ' + AA_GRAPHIQUE + ':1)', PAIRES_GRAPHIQUES),
    '',
    tableauTypographie(),
    '',
    tableauEspaces(),
    ''
  ].join('\n');
}
