// Le registre des mesures de mise en page de l'interface (DESIGN.md, « le carnet d'atelier ») : une echelle
// d'espacement, des rayons et des couches d'empilement, nommes par leur role. Comme les couleurs (jetons.ts) et
// les tailles de texte (typographie.ts), c'est la seule source : la feuille lit une variable, et un test
// interdit un espacement, un rayon ou une couche ecrits en dur.
//
// Pourquoi une base de 4 avec un pas de 6 : la meme echelle que l'editeur svg, pour que les deux outils se
// ressemblent ; 6 est le pas des listes et des groupes de boutons, qu'une echelle de 8 seule ne donne pas.

export interface Mesure {
  readonly id: string;
  readonly valeur: string;
  readonly description: string;
}

export const ESPACES: readonly Mesure[] = [
  { id: 'esp-2xs', valeur: '2px', description: 'Entre deux éléments collés : onglets d’un groupe, icône et son repère' },
  { id: 'esp-xs', valeur: '4px', description: 'L’intérieur d’une barre, entre les outils' },
  { id: 'esp-s', valeur: '6px', description: 'Entre les lignes d’une liste, les boutons d’un groupe ; l’intérieur d’un bouton' },
  { id: 'esp-m', valeur: '8px', description: 'L’intérieur d’un champ ou d’un menu ; entre les éléments d’un panneau' },
  { id: 'esp-l', valeur: '12px', description: 'Entre deux cartes, l’intérieur d’un message, le côté d’un bouton' },
  { id: 'esp-xl', valeur: '16px', description: 'L’intérieur d’une carte ou d’une boîte, entre deux groupes' },
  { id: 'esp-2xl', valeur: '24px', description: 'Les marges de la page' },
  { id: 'esp-3xl', valeur: '48px', description: 'Le pied de la page, l’intérieur de la zone de dépôt vide' }
];

export const RAYONS: readonly Mesure[] = [
  { id: 'rayon-pastille', valeur: '4px', description: 'Pastilles de couleur, vignettes, petites marques' },
  { id: 'rayon-champ', valeur: '5px', description: 'Champs, éléments de menu' },
  { id: 'rayon-bouton', valeur: '6px', description: 'Boutons, messages, onglets' },
  { id: 'rayon-menu', valeur: '8px', description: 'Menus déroulants, panneaux flottants' },
  { id: 'rayon-carte', valeur: '10px', description: 'Cartes, zones de dépôt, boîtes de dialogue' }
];

export const COUCHES: readonly Mesure[] = [
  { id: 'couche-glisser', valeur: '5', description: 'Le repère d’insertion pendant qu’on glisse des pages dans la grille' },
  { id: 'couche-barre', valeur: '10', description: 'La barre d’outils, collée en haut quand la grille défile' },
  { id: 'couche-apercu', valeur: '1000', description: 'L’aperçu d’une page en grand, au-dessus de la grille' },
  { id: 'couche-dialogue', valeur: '1200', description: 'Le voile et la boîte de scission' },
  { id: 'couche-attente', valeur: '1300', description: 'La roue d’attente au milieu de l’écran, au-dessus de tout pendant un travail' }
];

const TOUTES = [...ESPACES, ...RAYONS, ...COUCHES];

/** Les declarations des mesures, a poser dans le :root des jetons. */
export function declarationsEspaces(retrait: string): string {
  return TOUTES.map(m => retrait + '--' + m.id + ': ' + m.valeur + ';').join('\n');
}

/** La table de docs/jetons.md pour les mesures. */
export function tableauEspaces(): string {
  const table = (titre: string, liste: readonly Mesure[]) => ['### ' + titre, '', '| Jeton | Valeur | Rôle |', '|---|---|---|', ...liste.map(m => '| `--' + m.id + '` | `' + m.valeur + '` | ' + m.description + ' |')].join('\n');
  return [table('L’espacement : une base de 4, avec un pas de 6', ESPACES), '', table('Les rayons : croissants avec la surface', RAYONS), '', table('Les couches d’empilement', COUCHES)].join('\n');
}
