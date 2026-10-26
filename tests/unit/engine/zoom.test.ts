import { describe, it, expect } from 'vitest';
import {
  cadreVignette, defilementAncre, echelleEffective, echelleVoisine, ECHELLE_MAX, facteurMolette, largeurDeRendu,
  largeurVignette, palierVoisin, PALIERS_VIGNETTE, pourcentage
} from '../../../src/engine/zoom.js';

describe('zoom de la grille', () => {
  it('avance par paliers, borne aux extremes', () => {
    expect(palierVoisin(0, -1)).toBe(0);
    expect(palierVoisin(2, 1)).toBe(3);
    expect(palierVoisin(PALIERS_VIGNETTE.length - 1, 1)).toBe(PALIERS_VIGNETTE.length - 1);
    expect(largeurVignette(99)).toBe(PALIERS_VIGNETTE[PALIERS_VIGNETTE.length - 1]);
  });

  it('cadre une page dans un carre, portrait comme paysage', () => {
    expect(cadreVignette(595, 842, 160)).toEqual({ largeur: 113, hauteur: 160 });
    expect(cadreVignette(842, 595, 160)).toEqual({ largeur: 160, hauteur: 113 });
    expect(cadreVignette(0, 10, 160)).toEqual({ largeur: 160, hauteur: 160 });
  });

  it('dessine par paliers, pour qu un petit zoom ne redessine rien', () => {
    expect(largeurDeRendu(150, 1)).toBe(192);
    expect(largeurDeRendu(160, 1)).toBe(192);
    expect(largeurDeRendu(160, 2)).toBe(320);
    expect(largeurDeRendu(161, 2)).toBe(400);
    expect(largeurDeRendu(5000, 3)).toBe(2400);
  });
});

describe('zoom de l apercu', () => {
  const a4 = { largeur: 595, hauteur: 842 };
  it('ajuste a la page ou a la largeur', () => {
    expect(echelleEffective({ mode: 'page' }, a4, { largeur: 1000, hauteur: 421 })).toBeCloseTo(0.5);
    expect(echelleEffective({ mode: 'largeur' }, a4, { largeur: 1190, hauteur: 421 })).toBeCloseTo(2);
    expect(echelleEffective({ mode: 'libre', echelle: 99 }, a4, { largeur: 1, hauteur: 1 })).toBe(ECHELLE_MAX);
    expect(echelleEffective({ mode: 'page' }, a4, { largeur: 0, hauteur: 0 })).toBe(1);
  });

  it('passe a l echelle voisine depuis n importe ou', () => {
    expect(echelleVoisine(1, 1)).toBe(1.25);
    expect(echelleVoisine(1, -1)).toBe(0.9);
    expect(echelleVoisine(0.8, 1)).toBe(0.9);
    expect(echelleVoisine(8, 1)).toBe(8);
  });

  it('garde le point vise sous le pointeur', () => {
    // Le point a 100 px du bord, avec 300 px deja defiles, est a 400 px du debut ; a l echelle double, a 800.
    expect(defilementAncre(300, 100, 1, 2)).toBe(700);
    expect(defilementAncre(0, 50, 2, 1)).toBe(0);
  });

  it('un cran de molette vers le haut agrandit, vers le bas reduit', () => {
    expect(facteurMolette(-100)).toBeGreaterThan(1);
    expect(facteurMolette(100)).toBeLessThan(1);
    expect(facteurMolette(-100) * facteurMolette(100)).toBeCloseTo(1);
    expect(pourcentage(1.254)).toBe('125 %');
  });
});
