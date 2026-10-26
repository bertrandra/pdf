import { describe, it, expect } from 'vitest';
import { existsSync as existe, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

// Une regle d'architecture qu'aucun test ne verifie n'est pas une regle, c'est un souhait.
// Les couches sont fixees ici une fois pour toutes (ADR-0001), les reservees comprises.

const src = resolve(__dirname, '../../src');

/**
 * Les couches, de la plus pure a la plus dependante. Une couche ne
 * peut importer que d'un niveau inferieur ou egal au sien. Les couches reservees sont classees avant
 * d'exister : un dossier qui apparait a deja sa place.
 *
 * - **0** `util` (pur) et `shell` (DOM sans domaine) : des primitives.
 * - **1** `geometry` : des mathematiques, rien d'autre.
 * - **2** `model` : ce qu'est un montage. `plateforme` : ce qu'une plateforme promet.
 * - **3** `engine` : ce qu'on calcule sur un montage. `styles` : la palette de l'interface.
 * - **4** `core`, `io`, `render`, `export`, `interaction` : ce qu'on fait du montage.
 * - **5** `ui` : descripteurs de champs, aides de rendu.
 * - **6** `app`, `zones` : l'orchestration et les zones React.
 */
const NIVEAU: Record<string, number> = {
  util: 0, shell: 0,
  geometry: 1,
  model: 2, plateforme: 2,
  engine: 3, styles: 3,
  core: 4, io: 4, render: 4, export: 4, interaction: 4,
  ui: 5,
  app: 6, zones: 6
};

function fichiersTs(dir: string): string[] {
  return readdirSync(dir).flatMap(nom => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiersTs(chemin);
    return /\.tsx?$/.test(chemin) ? [chemin] : [];
  });
}

/** Une dependance d'un fichier vers un autre, resolue en chemin absolu sans extension. */
interface Dependance { cible: string; type: boolean; dynamique: boolean }

// Toutes les formes qu'un import peut prendre, sur plusieurs lignes au besoin :
//   import { a } from '…'   import type { A } from '…'   import '…'
//   export { a } from '…'   export type { A } from '…'   import('…')
// Une premiere version ne lisait que `from '../x/'` sur une seule ligne : un module qui ecrivait
// `../../x/` echappait a la regle sans que personne ne le voie.
const STATIQUE = /\b(import|export)(\s+type)?\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
const DYNAMIQUE = /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)(\.(?!then\b)\w+)?/g;

function resoudre(depuis: string, specifiant: string): string {
  return resolve(dirname(depuis), specifiant).replace(/\.(js|tsx?)$/, '');
}

/** Les dependances d'un fichier vers d'autres fichiers de src/. */
function dependances(chemin: string, texte = readFileSync(chemin, 'utf8')): Dependance[] {
  const out: Dependance[] = [];
  for (const m of texte.matchAll(STATIQUE)) {
    // `import type` et `export type` sont effaces au build : ils ne creent aucune dependance reelle.
    out.push({ cible: resoudre(chemin, m[3]!), type: m[2] !== undefined, dynamique: false });
  }
  for (const m of texte.matchAll(DYNAMIQUE)) {
    // `import('../model/types.js').PtBrut` est une reference de type ecrite en syntaxe d'import.
    out.push({ cible: resoudre(chemin, m[1]!), type: m[2] !== undefined, dynamique: true });
  }
  return out.filter(d => d.cible.startsWith(src + sep));
}

/** La couche d'un chemin sous src/ : son premier dossier, ou undefined hors dossier. */
function couche(chemin: string): string | undefined {
  const morceaux = relative(src, chemin).split(sep);
  return morceaux.length > 1 ? morceaux[0] : undefined;
}

const tous = fichiersTs(src);

describe('les fleches ne pointent que vers le bas', () => {
  it('aucun module n importe d une couche plus haute que la sienne', () => {
    const violations: string[] = [];
    for (const f of tous) {
      const de = couche(f);
      if (de === undefined || NIVEAU[de] === undefined) continue;
      for (const d of dependances(f)) {
        if (d.type) continue;
        const vers = couche(d.cible);
        if (vers !== undefined && NIVEAU[vers] !== undefined && NIVEAU[vers] > NIVEAU[de]!) {
          violations.push(`${relative(src, f)} -> ${relative(src, d.cible)} (niveau ${NIVEAU[de]} vers ${NIVEAU[vers]})`);
        }
      }
    }
    expect(violations, 'dependances remontantes').toEqual([]);
  });

  it('voit les imports sur plusieurs lignes, les re-exports, les imports dynamiques et les chemins profonds', () => {
    // Le test ci-dessus ne vaut que ce que vaut sa lecture des imports : ce cas-ci la garde honnete,
    // sur un texte temoin qui porte chaque forme.
    const faux = join(src, 'app/sous/temoin.ts');
    const texte = [
      "import {\n  a,\n  b\n} from '../../model/montage.js';",
      "export { c } from '../../engine/montage.js';",
      "import '../../util/tableaux.js';",
      "import type { Proprietes } from '../../zones/Application.js';",
      "const f = (p: import('../../model/montage.js').Montage) => p;",
      "void import('../commandes.js').then(m => m);"
    ].join('\n');
    const vues = dependances(faux, texte).map(d => [relative(src, d.cible), d.type, d.dynamique]);
    expect(vues).toEqual([
      [join('model', 'montage'), false, false],
      [join('engine', 'montage'), false, false],
      [join('util', 'tableaux'), false, false],
      [join('zones', 'Application'), true, false],
      [join('model', 'montage'), true, true],
      [join('app', 'commandes'), false, true]
    ]);
  });

  it('range chaque dossier de src/ dans une couche connue', () => {
    // Un dossier neuf non classe echapperait silencieusement a la regle : le test le refuse.
    const dossiers = readdirSync(src).filter(n => {
      try { return statSync(join(src, n)).isDirectory(); } catch { return false; }
    });
    expect(dossiers.filter(d => NIVEAU[d] === undefined), 'dossiers hors couches').toEqual([]);
  });
});

describe('aucun cycle d import', () => {
  it('le graphe des imports de valeur est acyclique', () => {
    // Un cycle marche jusqu'au jour ou l'ordre d'evaluation change et qu'une constante est lue avant
    // d'exister. Les imports de type ne comptent pas (effaces), ni les imports dynamiques : ils sont
    // resolus apres le chargement, et c'est justement l'outil qui sert a couper une boucle.
    const index = new Map(tous.map(f => [f.replace(/\.tsx?$/, ''), f]));
    const voisins = new Map(tous.map(f => [f, dependances(f)
      .filter(d => !d.type && !d.dynamique)
      .map(d => index.get(d.cible) ?? index.get(join(d.cible, 'index')))
      .filter((c): c is string => c !== undefined)]));
    const etat = new Map<string, 1 | 2>();
    const pile: string[] = [];
    const cycles: string[] = [];
    const visiter = (f: string): void => {
      etat.set(f, 1); pile.push(f);
      for (const v of voisins.get(f)!) {
        if (etat.get(v) === 1) cycles.push([...pile.slice(pile.indexOf(v)), v].map(x => relative(src, x)).join(' > '));
        else if (!etat.has(v)) visiter(v);
      }
      pile.pop(); etat.set(f, 2);
    };
    for (const f of tous) if (!etat.has(f)) visiter(f);
    expect(cycles, 'cycles').toEqual([]);
  });
});

/**
 * Le code sans ses commentaires. Le domaine parle francais : « le document. » en fin de phrase
 * d'un commentaire n'est pas l'objet `document` du DOM.
 */
function sansCommentaires(texte: string): string {
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

describe('ce qui doit rester pur', () => {
  it('geometry, model, util et engine ne touchent jamais au DOM', () => {
    // C'est ce qui rend ces couches testables sans navigateur, et reutilisables ailleurs.
    const coupables: string[] = [];
    for (const couche of ['geometry', 'model', 'util', 'engine', 'styles']) {
      if (!existe(join(src, couche))) continue;
      for (const f of fichiersTs(join(src, couche))) {
        const t = sansCommentaires(readFileSync(f, 'utf8'));
        // `document.` hors d'un chemin d'import : le modele s'appelle document.ts, le DOM non.
        if (/(?<![./'"])\bdocument\.(?!js['"])|\bwindow\.|localStorage|HTMLElement|SVGElement/.test(t)) {
          coupables.push(`${couche}/${f.split(/[\\/]/).pop()}`);
        }
      }
    }
    expect(coupables, 'couches pures qui touchent au DOM').toEqual([]);
  });

  it('le coeur pur ne lit ni l horloge, ni le hasard, ni le reseau', () => {
    // Un resultat produit hier doit etre reproductible aujourd'hui. Une date ou un tirage se
    // passent en parametre.
    const coupables: string[] = [];
    for (const couche of ['geometry', 'model', 'util', 'engine', 'styles']) {
      if (!existe(join(src, couche))) continue;
      for (const f of fichiersTs(join(src, couche))) {
        if (/\bDate\.now\b|new Date\(\s*\)|Math\.random|\bfetch\(|XMLHttpRequest/.test(sansCommentaires(readFileSync(f, 'utf8')))) {
          coupables.push(relative(src, f));
        }
      }
    }
    expect(coupables, 'coeur impur').toEqual([]);
  });
});
