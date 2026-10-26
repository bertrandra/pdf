import { describe, it, expect } from 'vitest';
import { paragraphes, type Fragment } from '../../../src/engine/texte.js';

/** Un fragment a la ligne `y`, de taille 10 ; sa largeur suit son texte (5 points par caractere). */
const f = (texte: string, x: number, y: number, fin = false, taille = 10): Fragment => ({ texte, x, y, largeur: texte.length * 5, taille, fin });

describe('paragraphes', () => {
  it('recolle les lignes d un meme paragraphe, et coupe sur un grand interligne', () => {
    expect(paragraphes([
      f('Premier paragraphe', 50, 700, true), f('sur deux lignes.', 50, 688, true),
      f('Second.', 50, 650, true)
    ])).toEqual(['Premier paragraphe sur deux lignes.', 'Second.']);
  });

  it('separe deux fragments d une ligne par une espace seulement s il y a un blanc', () => {
    expect(paragraphes([f('Bon', 50, 700), f('jour', 65, 700), f('monde', 100, 700, true)])).toEqual(['Bonjour monde']);
    expect(paragraphes([f('Bon ', 50, 700), f('jour', 90, 700, true)])).toEqual(['Bon jour']);
  });

  it('recolle un mot coupe en fin de ligne, mais pas un trait d union suivi d une majuscule', () => {
    expect(paragraphes([f('le trans-', 50, 700, true), f('port aérien', 50, 688, true)])).toEqual(['le transport aérien']);
    expect(paragraphes([f('Jean-', 50, 700, true), f('Pierre', 50, 688, true)])).toEqual(['Jean- Pierre']);
  });

  it('lit les fins de ligne vides de pdf.js comme de simples fins de ligne, et rend rien pour une page sans texte', () => {
    // pdf.js rend « ligne », puis un fragment vide qui porte la fin de ligne, puis la ligne suivante.
    expect(paragraphes([f('Un', 50, 700), f('', 60, 700, true), f('deux', 50, 688), f('', 70, 688, true), f('Trois', 50, 650, true)])).toEqual(['Un deux', 'Trois']);
    expect(paragraphes([f('le trans-', 50, 700), f('', 95, 700, true), f('port', 50, 688, true)])).toEqual(['le transport']);
    expect(paragraphes([f('', 50, 700)])).toEqual([]);
    expect(paragraphes([])).toEqual([]);
  });

  it('un saut de taille commence un nouveau paragraphe (un titre)', () => {
    expect(paragraphes([f('Titre', 50, 720, true, 24), f('Texte courant.', 50, 680, true)])).toEqual(['Titre', 'Texte courant.']);
  });

  it('les blancs se resserrent', () => {
    expect(paragraphes([f('  a   b  ', 50, 700, true)])).toEqual(['a b']);
  });
});
