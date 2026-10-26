import { describe, it, expect } from 'vitest';
import { boitesOcr, effacerLignes, ligneSure, lignesOcrPosees, paragraphesOcr, type LigneOcr, type MotOcr } from '../../../src/engine/ocr.js';

/** Un mot de 10 px de haut sur la ligne de base y = 100, de `x` a `x + 10 * longueur`. */
const mot = (texte: string, x: number, confiance = 90): MotOcr => ({ texte, confiance, boite: { x0: x, y0: 90, x1: x + 10 * texte.length, y1: 100 } });
const ligne = (mots: MotOcr[], pente = 0): LigneOcr => ({
  mots, hauteur: 12, boite: { x0: mots[0]?.boite.x0 ?? 0, y0: 90, x1: mots[mots.length - 1]?.boite.x1 ?? 0, y1: 100 },
  ligneDeBase: { x0: 0, y0: 100, x1: 1000, y1: 100 + pente * 1000 }
});

describe('ligneSure', () => {
  it('garde une ligne sure, ecarte le bruit et ce qui n a ni lettre ni chiffre', () => {
    expect(ligneSure(ligne([mot('Bonjour', 0), mot('monde', 80)]))).toBe(true);
    expect(ligneSure(ligne([mot('Bonjour', 0, 40), mot('monde', 80, 50)]))).toBe(false);
    expect(ligneSure(ligne([mot('~—', 0, 95)]))).toBe(false);
    expect(ligneSure(ligne([]))).toBe(false);
  });
});

describe('lignesOcrPosees', () => {
  it('pose la ligne en points, a la taille d Arial, le haut deduit de la ligne de base', () => {
    const [l] = lignesOcrPosees([{ lignes: [ligne([mot('Bonjour', 50), mot('monde', 130)])] }], 0.24);
    // 300 dpi : 0,24 point par pixel. Rangee de 12 px / 0,93 = 12,9 px = 3,1 pt.
    expect(l?.taille).toBeCloseTo((12 / 0.93) * 0.24);
    expect(l?.x).toBeCloseTo(12);
    expect(l?.haut).toBeCloseTo(100 * 0.24 - 0.9 * (12 / 0.93) * 0.24);
    expect(l?.segments).toEqual([{ texte: 'Bonjour monde', police: 'Arial', gras: false, italique: false }]);
    expect(l?.angle).toBe(0);
  });

  it('coupe une rangee de tableau en cellules, chacune a sa place', () => {
    const lignes = lignesOcrPosees([{ lignes: [ligne([mot('A-1023', 0), mot('Ramette', 200), mot('papier', 280), mot('12', 500)])] }], 1);
    expect(lignes.map(l => [l.segments[0]?.texte, l.x])).toEqual([['A-1023', 0], ['Ramette papier', 200], ['12', 500]]);
    expect(boitesOcr([{ lignes: [ligne([mot('A-1023', 0), mot('Ramette', 200), mot('papier', 280), mot('12', 500)])] }]))
      .toEqual([{ x0: 0, y0: 90, x1: 60, y1: 100 }, { x0: 200, y0: 90, x1: 340, y1: 100 }, { x0: 500, y0: 90, x1: 520, y1: 100 }]);
  });

  it('suit la pente d un scan de travers, et ignore une pente infime', () => {
    expect(lignesOcrPosees([{ lignes: [ligne([mot('Penche', 0)], Math.tan(Math.PI / 180))] }], 1)[0]?.angle).toBeCloseTo(1);
    expect(lignesOcrPosees([{ lignes: [ligne([mot('Droit', 0)], 0.001)] }], 1)[0]?.angle).toBe(0);
  });

  it('ne pose pas les lignes incertaines', () => {
    expect(lignesOcrPosees([{ lignes: [ligne([mot('bruit', 0, 20)])] }], 1)).toEqual([]);
    expect(boitesOcr([{ lignes: [ligne([mot('bruit', 0, 20)])] }])).toEqual([]);
  });
});

describe('paragraphesOcr', () => {
  it('recolle les lignes d un paragraphe et les mots coupes', () => {
    expect(paragraphesOcr([{ lignes: [ligne([mot('le', 0), mot('trans-', 30)]), ligne([mot('port', 0), mot('aérien', 50)])] }])).toEqual(['le transport aérien']);
  });

  it('garde chaque rangee de tableau seule, ses cellules separees par des tabulations', () => {
    expect(paragraphesOcr([{ lignes: [
      ligne([mot('Facture', 0)]),
      ligne([mot('A-1023', 0), mot('Ramette', 200), mot('12', 500)]),
      ligne([mot('B-2207', 0), mot('Cartouche', 200), mot('3', 500)])
    ] }])).toEqual(['Facture', 'A-1023\tRamette\t12', 'B-2207\tCartouche\t3']);
  });
});

describe('effacerLignes', () => {
  /** Une image 20 x 10 de papier creme, avec un trait d'encre bleu fonce de 6 x 2 au milieu. */
  function image(): { donnees: number[]; largeur: number; hauteur: number } {
    const donnees: number[] = [];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 20; x++) {
      const encre = x >= 7 && x < 13 && y >= 4 && y < 6;
      donnees.push(...(encre ? [20, 30, 90] : [250, 245, 230]), 255);
    }
    return { donnees, largeur: 20, hauteur: 10 };
  }

  it('lit l encre, puis repeint la boite de la couleur du papier', () => {
    const img = image();
    expect(effacerLignes(img, [{ x0: 7, y0: 4, x1: 13, y1: 6 }], 1)).toEqual(['141E5A']);
    const i = (5 * 20 + 10) * 4;
    expect(img.donnees.slice(i, i + 3)).toEqual([250, 245, 230]);
  });

  it('rend null quand rien ne se distingue du papier, et borne la boite a l image', () => {
    const img = image();
    expect(effacerLignes(img, [{ x0: 0, y0: 0, x1: 3, y1: 2 }], 0)).toEqual([null]);
    expect(effacerLignes(img, [{ x0: -50, y0: -50, x1: -40, y1: -40 }])).toEqual([null]);
  });
});
