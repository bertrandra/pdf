import { describe, it, expect } from 'vitest';
import { ecrireDocxFidele, ecrireDocxTexte } from '../../../src/export/docx.js';
import { bornerTaille, echapper, type PageImage } from '../../../src/export/ooxml.js';
import { ecrirePptx } from '../../../src/export/pptx.js';
import { lireZip, texte } from '../../aide/zip.js';

// Une « image » temoin : les ecrivains ne lisent pas les octets, ils les rangent.
const image = (n: number): Uint8Array => new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9]);
const page = (largeur: number, hauteur: number, n = 1): PageImage => ({ largeur, hauteur, image: image(n), format: 'jpeg' });

/** Les cibles de toutes les relations d'une archive doivent exister, et chaque partie XML avoir un type declare. */
function verifierPaquet(archive: Map<string, Uint8Array>): void {
  const types = texte(archive, '[Content_Types].xml');
  for (const [nom] of archive) {
    if (nom.endsWith('.rels')) {
      const dossier = nom.replace(/_rels\/[^/]*\.rels$/, '');
      for (const m of texte(archive, nom).matchAll(/Target="([^"]+)"/g)) {
        const cible = new URL(m[1] ?? '', 'http://x/' + dossier).pathname.slice(1);
        expect(archive.has(cible), nom + ' -> ' + cible).toBe(true);
      }
    } else if (nom.endsWith('.xml') && nom !== '[Content_Types].xml') {
      expect(types, nom).toContain('PartName="/' + nom + '"');
    }
  }
  expect([...archive.keys()][0]).toBe('[Content_Types].xml');
}

describe('outils communs', () => {
  it('echappe le texte et retire ce que XML interdit', () => {
    expect(echapper('a < b & "c" > d\u0001')).toBe('a &lt; b &amp; &quot;c&quot; &gt; d');
  });

  it('borne une taille sans la deformer', () => {
    expect(bornerTaille(595, 842, 72, 1584)).toEqual({ largeur: 595, hauteur: 842 });
    const grande = bornerTaille(3000, 1500, 72, 1584);
    expect(grande.largeur).toBeCloseTo(1584);
    expect(grande.hauteur).toBeCloseTo(792);
    const petite = bornerTaille(36, 18, 72, 1584);
    expect(petite).toEqual({ largeur: 144, hauteur: 72 });
    expect(bornerTaille(5000, 10, 72, 1584).largeur).toBeCloseTo(1584);
  });
});

describe('PowerPoint', () => {
  it('une diapositive par page, a la taille de la premiere, chaque page entiere et centree', () => {
    const a = lireZip(ecrirePptx([page(595, 842, 1), page(842, 595, 2)]));
    verifierPaquet(a);
    expect(texte(a, 'ppt/presentation.xml')).toContain('<p:sldSz cx="7556500" cy="10693400"/>');
    expect(texte(a, 'ppt/presentation.xml').match(/<p:sldId /g)).toHaveLength(2);
    // La page paysage dans la diapositive portrait : pleine largeur, centree en hauteur.
    const deux = texte(a, 'ppt/slides/slide2.xml');
    expect(deux).toContain('<a:ext cx="7556500" cy="5339807"/>');
    expect(deux).toMatch(/<a:off x="0" y="267679[67]"\/>/);
    expect(a.get('ppt/media/image2.jpeg')).toEqual(image(2));
  });

  it('memes pages, memes octets, sans date', () => {
    const pages = [page(595, 842)];
    expect(Buffer.from(ecrirePptx(pages)).equals(Buffer.from(ecrirePptx(pages)))).toBe(true);
    expect(new TextDecoder().decode(ecrirePptx(pages))).not.toMatch(/dcterms|created|modified/);
  });

  it('refuse une liste vide', () => {
    expect(() => ecrirePptx([])).toThrow(RangeError);
  });
});

describe('Word', () => {
  it('fidele : une section par page, a sa taille et son orientation, l image derriere', () => {
    const a = lireZip(ecrireDocxFidele([page(595, 842, 1), page(842, 595, 2)]));
    verifierPaquet(a);
    const doc = texte(a, 'word/document.xml');
    expect(doc.match(/<w:sectPr>/g)).toHaveLength(2);
    expect(doc).toContain('<w:pgSz w:w="11900" w:h="16840"/>');
    expect(doc).toContain('<w:pgSz w:w="16840" w:h="11900" w:orient="landscape"/>');
    expect(doc).toContain('behindDoc="1"');
    expect(a.get('word/media/page-2.jpeg')).toEqual(image(2));
    // La section du corps est la derniere chose du corps.
    expect(doc).toMatch(/<\/w:sectPr><\/w:body>/);
  });

  it('texte : des paragraphes echappes, chaque page du PDF sur une page Word', () => {
    const a = lireZip(ecrireDocxTexte([
      { largeur: 595, hauteur: 842, paragraphes: ['Bonjour <monde> & co', 'Deux'] },
      { largeur: 595, hauteur: 842, paragraphes: [] },
      { largeur: 595, hauteur: 842, paragraphes: ['Trois'] }
    ]));
    verifierPaquet(a);
    const doc = texte(a, 'word/document.xml');
    expect(doc).toContain('<w:t xml:space="preserve">Bonjour &lt;monde&gt; &amp; co</w:t>');
    expect(doc.match(/<w:pageBreakBefore\/>/g)).toHaveLength(2);
    expect(doc).toContain('<w:pgMar w:top="1134"');
    expect([...a.keys()].some(n => n.startsWith('word/media/'))).toBe(false);
  });

  it('memes pages, memes octets', () => {
    const pages = [page(595, 842)];
    expect(Buffer.from(ecrireDocxFidele(pages)).equals(Buffer.from(ecrireDocxFidele(pages)))).toBe(true);
  });
});
