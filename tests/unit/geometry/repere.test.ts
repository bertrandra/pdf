import { describe, it, expect } from 'vitest';
import { matriceDeLigne, pointVersPage, tailleVue, type QuartDeTour } from '../../../src/geometry/repere.js';

const boite = { x: 10, y: 20, largeur: 600, hauteur: 800 };

describe('le passage du repere vu au repere de la page', () => {
  it('envoie les coins de la page vue sur les coins de la boite, pour chaque quart de tour', () => {
    // Le coin haut gauche vu, pour chaque rotation : celui que l'ecran montre en haut a gauche.
    const attendus: Record<QuartDeTour, { x: number; y: number }> = { 0: { x: 10, y: 820 }, 90: { x: 10, y: 20 }, 180: { x: 610, y: 20 }, 270: { x: 610, y: 820 } };
    for (const r of [0, 90, 180, 270] as const) {
      expect(pointVersPage(boite, r, 0, 0)).toEqual(attendus[r]);
      const { largeur, hauteur } = tailleVue(boite, r);
      const oppose = pointVersPage(boite, r, largeur, hauteur);
      // Le coin oppose vu est le coin oppose de la boite.
      expect([oppose.x, oppose.y]).toEqual([attendus[r].x === 10 ? 610 : 10, attendus[r].y === 20 ? 820 : 20]);
    }
  });

  it('fait filer le texte vers la droite vue et monter ses hampes vers le haut vu', () => {
    expect(matriceDeLigne(boite, 0, 5, 7)).toEqual([1, 0, 0, 1, 15, 813]);
    const [a, b, c, d] = matriceDeLigne(boite, 90, 0, 0);
    // Tourne d'un quart a droite a l'ecran : dans la page, le texte monte, ses hampes vont vers la gauche.
    expect([a, b, c, d].map(v => Math.round(v))).toEqual([0, 1, -1, 0]);
  });
});
