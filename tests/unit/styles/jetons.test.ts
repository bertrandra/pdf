import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JETONS, PAIRES, PAIRES_GRAPHIQUES, ROLES, contrasteDe, tableauJetons } from '../../../src/styles/jetons.js';
import { FAMILLES, TAILLES } from '../../../src/styles/typographie.js';
import { COUCHES, ESPACES, RAYONS } from '../../../src/styles/espaces.js';

// Le registre est la seule source des couleurs, tailles et mesures de l'interface : ces tests le confrontent a la
// feuille de la page et au code, et tiennent les contrastes. ACTUALISER_REFERENCES=1 regenere docs/jetons.md.

const racine = join(__dirname, '../../..');
const feuille = ['page.html', 'page.css'].map(f => readFileSync(join(racine, 'outils/pdf', f), 'utf8')).join('\n');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(nom => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const code = sources(join(racine, 'src')).filter(f => !/styles[/\\]/.test(f)).map(f => sansCommentaires(readFileSync(f, 'utf8'))).join('\n');
/** Les variables propres a un composant, posees en ligne par lui : la taille d'une case de la grille (Grille.tsx). */
const LOCALES = new Set(['cote']);
const lues = (texte: string) => new Set([...texte.matchAll(/var\(--([a-z][a-z0-9-]*)/g)].map(m => m[1] ?? ''));
const connus = new Set([...LOCALES, ...JETONS.map(j => j.id), ...FAMILLES.map(([id]) => id), ...[...TAILLES, ...ESPACES, ...RAYONS, ...COUCHES].map(t => t.id)]);
const HEX = /^#[0-9a-f]{6}$/;
const RGBA = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\)$/;

describe('le registre', () => {
  it('a des identifiants uniques et des valeurs que le CSS lit', () => {
    const ids = JETONS.map(j => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const j of JETONS) {
      expect(HEX.test(j.clair) || RGBA.test(j.clair), j.id).toBe(true);
      expect(HEX.test(j.sombre) || RGBA.test(j.sombre), j.id).toBe(true);
    }
    const roles = new Set(ROLES.map(r => r[0]));
    expect(JETONS.every(j => roles.has(j.role))).toBe(true);
  });

  it('chaque paire tient son contraste dans les deux themes', () => {
    for (const p of [...PAIRES, ...PAIRES_GRAPHIQUES]) {
      for (const theme of ['clair', 'sombre'] as const) {
        expect(contrasteDe(p, theme), p.texte + ' sur ' + p.fond + ' (' + theme + ')').toBeGreaterThanOrEqual(p.minimum);
      }
    }
  });
});

describe('la feuille et le code', () => {
  it('ne lisent que des variables du registre', () => {
    expect([...lues(feuille + code)].filter(v => !connus.has(v))).toEqual([]);
  });

  it('n ecrivent aucune couleur en dur', () => {
    expect(sansCommentaires(feuille).match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|color-mix\(/gi) ?? []).toEqual([]);
    expect(code.match(/['"`]#[0-9a-f]{3,8}['"`]|rgba?\(\d/gi) ?? []).toEqual([]);
  });

  it('n ecrivent aucune taille de texte, aucun rayon ni aucune couche en dur', () => {
    expect(feuille.match(/font-size:\s*\d|border-radius:\s*\d+px|z-index:\s*\d/g) ?? []).toEqual([]);
  });

  it('chaque jeton de couleur sert', () => {
    const toutes = lues(feuille + code);
    expect(JETONS.filter(j => !toutes.has(j.id)).map(j => j.id)).toEqual([]);
  });
});

describe('docs/jetons.md', () => {
  it('est a jour', () => {
    const chemin = join(racine, 'docs/jetons.md');
    if (process.env.ACTUALISER_REFERENCES === '1') writeFileSync(chemin, tableauJetons());
    expect(existsSync(chemin) ? readFileSync(chemin, 'utf8') : '', 'ACTUALISER_REFERENCES=1 npx vitest run tests/unit/styles').toBe(tableauJetons());
  });
});
