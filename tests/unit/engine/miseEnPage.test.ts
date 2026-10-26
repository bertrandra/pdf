import { describe, it, expect } from 'vitest';
import { couleurDuTexte, lignesPosees, lirePolice, texteDeLigne, type FragmentVu } from '../../../src/engine/miseEnPage.js';

/** Un fragment horizontal sur la ligne de base `y`, de taille 10, 5 points par caractere. */
const f = (texte: string, x: number, y: number, autre: Partial<FragmentVu> = {}): FragmentVu => ({
  texte, x, y, largeur: texte.length * 5, taille: 10, angle: 0, ascendante: 0.8, police: 'Arial', gras: false, italique: false, fin: false, ...autre
});

describe('lignesPosees', () => {
  it('pose chaque ligne a sa place, le haut de la boite au-dessus de la ligne de base', () => {
    const [l] = lignesPosees([f('Bonjour', 50, 100, { fin: true })]);
    expect(l).toMatchObject({ x: 50, haut: 92, largeur: 35, taille: 10, angle: 0 });
    expect(l && texteDeLigne(l)).toBe('Bonjour');
  });

  it('garde les styles en segments et fond les fragments de meme style', () => {
    const [l] = lignesPosees([f('Un ', 0, 100), f('mot', 15, 100, { gras: true }), f(' en', 30, 100), f(' plus', 45, 100, { fin: true })]);
    expect(l?.segments).toEqual([
      { texte: 'Un ', police: 'Arial', gras: false, italique: false },
      { texte: 'mot', police: 'Arial', gras: true, italique: false },
      { texte: ' en plus', police: 'Arial', gras: false, italique: false }
    ]);
  });

  it('coupe sur une fin de ligne, une autre ligne de base, un retour en arriere ou un grand blanc (cellules, colonnes)', () => {
    const lignes = lignesPosees([
      f('a', 0, 100), f('', 5, 100, { fin: true }), f('b', 0, 112),
      f('cellule', 200, 112), f('retour', 10, 112)
    ]);
    expect(lignes.map(texteDeLigne)).toEqual(['a', 'b', 'cellule', 'retour']);
  });

  it('ajoute une espace sur un blanc visible, et ignore les lignes vides', () => {
    expect(lignesPosees([f('Bon', 0, 100), f('jour', 15, 100), f('monde', 50, 100)]).map(texteDeLigne)).toEqual(['Bonjour monde']);
    expect(lignesPosees([f('   ', 0, 100, { fin: true })])).toEqual([]);
  });

  it('une ligne tournee garde sa direction et son haut se mesure perpendiculairement', () => {
    const [l] = lignesPosees([f('vertical', 100, 300, { angle: -90 })]);
    expect(l?.angle).toBe(-90);
    expect(l?.x).toBeCloseTo(92);
    expect(l?.haut).toBeCloseTo(300);
  });
});

describe('lirePolice', () => {
  it('retire le prefixe de sous-ensemble et lit le gras et l italique dans le nom', () => {
    expect(lirePolice('ABCDEF+Calibri-BoldItalic', 'sans-serif')).toEqual({ police: 'Calibri', gras: true, italique: true });
    expect(lirePolice('BAAAAA+LiberationSans-Bold', 'sans-serif')).toEqual({ police: 'Liberation Sans', gras: true, italique: false });
    expect(lirePolice('SegoeUI', 'sans-serif').police).toBe('Segoe UI');
  });

  it('ramene les polices standard et PostScript a leur nom courant', () => {
    expect(lirePolice('Helvetica-Oblique', '')).toEqual({ police: 'Arial', gras: false, italique: true });
    expect(lirePolice('TimesNewRomanPS-BoldMT', '').police).toBe('Times New Roman');
    expect(lirePolice('ArialMT', '').police).toBe('Arial');
    expect(lirePolice('Courier', '').police).toBe('Courier New');
  });

  it('sans nom lisible, choisit selon la famille generique', () => {
    expect(lirePolice('', 'serif').police).toBe('Times New Roman');
    expect(lirePolice('g_d0_f1?', 'monospace').police).toBe('Courier New');
    expect(lirePolice('', 'sans-serif').police).toBe('Arial');
  });
});

describe('couleurDuTexte', () => {
  /** Une image unie de 4 x 2 pixels, avec quelques pixels d'encre. */
  const image = (fond: number[], encre: Record<number, number[]> = {}) => {
    const donnees: number[] = [];
    for (let i = 0; i < 8; i++) donnees.push(...(encre[i] ?? fond), 255);
    return { donnees, largeur: 4, hauteur: 2 };
  };
  const boite = { x: 0, y: 0, largeur: 4, hauteur: 2 };

  it('lit la couleur des pixels que le texte change, le coeur des lettres plutot que leur bord', () => {
    const sans = image([0, 113, 156]);
    const avec = image([0, 113, 156], { 1: [255, 255, 255], 2: [255, 255, 255], 5: [128, 180, 200] });
    expect(couleurDuTexte(avec, sans, boite)).toBe('FFFFFF');
  });

  it('rend null pour un texte invisible', () => {
    expect(couleurDuTexte(image([255, 255, 255]), image([255, 255, 255]), boite)).toBeNull();
  });

  it('borne la boite a l image', () => {
    const sans = image([255, 255, 255]), avec = image([255, 255, 255], { 7: [200, 0, 0] });
    expect(couleurDuTexte(avec, sans, { x: -5, y: -5, largeur: 50, hauteur: 50 })).toBe('C80000');
  });
});
