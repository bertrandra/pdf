// La conversion en Word (ADR-0005), en deux facons qui ne se melangent pas :
// - **fidele** : chaque page du PDF devient une page Word de la meme taille, le fond de la page pose derriere bord a
//   bord, et chaque ligne de texte posee a sa place dans un cadre, modifiable (ADR-0006) ; une section par page, pour
//   que les tailles suivent. Une page sans texte lisible (un scan) reste une image.
// - **texte** : le texte de chaque page en paragraphes (engine/texte.ts), un saut de page entre deux pages du PDF.
//   Tout se modifie, mais la mise en page, les images et les tableaux sont perdus.
// Le fichier ne porte que ce que Word exige (le document, ses relations, ses styles) : ni date, ni auteur.

import { bornerTaille, echapper, emu, ENTETE, NS_A, NS_PIC, NS_REL_DOC, paquet, relations, typesDeContenu, type LigneColoree, type PageImage } from './ooxml.js';

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const TYPE_WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';

/** Les bornes d'une page Word, en points : de 1 a 22 pouces (31 680 vingtiemes de point, le plus que Word admette). */
const PAGE_MIN = 72, PAGE_MAX = 22 * 72;

/** Les points en vingtiemes de point (twips), l'unite des pages Word. */
const twips = (points: number): number => Math.round(points * 20);

/** Une page de texte a convertir : la taille de la page du PDF, et ses paragraphes. */
export interface PageTexte {
  readonly largeur: number;
  readonly hauteur: number;
  readonly paragraphes: readonly string[];
}

/** Les proprietes d'une section : sa taille de page et ses marges, en points. */
function section(largeur: number, hauteur: number, marge: number): string {
  const t = bornerTaille(largeur, hauteur, PAGE_MIN, PAGE_MAX);
  const m = twips(marge);
  return '<w:sectPr><w:pgSz w:w="' + twips(t.largeur) + '" w:h="' + twips(t.hauteur) + '"' + (t.largeur > t.hauteur ? ' w:orient="landscape"' : '') + '/>'
    + '<w:pgMar w:top="' + m + '" w:right="' + m + '" w:bottom="' + m + '" w:left="' + m + '" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
}

/**
 * L'image d'une page, ancree au coin de la page et posee derriere le texte : un paragraphe vide la porte sans
 * qu'une ligne de texte ne la pousse sur une page suivante, ce qu'une image en ligne de la hauteur de la page fait.
 */
function imageAncree(numero: number, rel: string, largeur: number, hauteur: number): string {
  const t = bornerTaille(largeur, hauteur, PAGE_MIN, PAGE_MAX);
  const cx = emu(t.largeur), cy = emu(t.hauteur), nom = 'Page ' + numero;
  return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="' + numero + '" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">'
    + '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>'
    + '<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>'
    + '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'
    + '<wp:docPr id="' + numero + '" name="' + nom + '" descr="' + nom + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
    + '<a:graphic><a:graphicData uri="' + NS_PIC + '"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="' + nom + '"/><pic:cNvPicPr/></pic:nvPicPr>'
    + '<pic:blipFill><a:blip r:embed="' + rel + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>';
}

const documentWord = (corps: string): string => ENTETE
  + '<w:document xmlns:w="' + NS_W + '" xmlns:r="' + NS_REL_DOC + '" xmlns:wp="' + NS_WP + '" xmlns:a="' + NS_A + '" xmlns:pic="' + NS_PIC + '">'
  + '<w:body>' + corps + '</w:body></w:document>';

/** Les styles : la police et l'espacement du texte courant, pour que le mode texte se lise sans retouche. */
const STYLES = ENTETE + '<w:styles xmlns:w="' + NS_W + '"><w:docDefaults>'
  + '<w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault>'
  + '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
  + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';

function paquetWord(corps: string, medias: ReadonlyArray<readonly [string, Uint8Array]>): Uint8Array {
  return paquet(
    typesDeContenu([['word/document.xml', TYPE_WML + 'document.main+xml'], ['word/styles.xml', TYPE_WML + 'styles+xml']]),
    [
      ['_rels/.rels', relations([{ id: 'rId1', type: 'officeDocument', cible: 'word/document.xml' }])],
      ['word/document.xml', documentWord(corps)],
      ['word/_rels/document.xml.rels', relations([
        { id: 'rId1', type: 'styles', cible: 'styles.xml' },
        ...medias.map(([nom], i) => ({ id: 'rId' + (i + 2), type: 'image', cible: 'media/' + nom }))
      ])],
      ['word/styles.xml', STYLES],
      ...medias.map(([nom, octets]) => ['word/media/' + nom, octets] as const)
    ]
  );
}

/**
 * Une ligne de texte dans un cadre pose a sa place sur la page (`framePr`, ancre a la page) : le paragraphe ne prend
 * aucune place dans le flux, et le texte reste du texte. La page a pu etre mise a l'echelle `k` (bornerTaille). Un
 * texte invisible (la couche OCR d'un scan) n'est pas pose : Word ne sait pas le rendre transparent ; il reste dans
 * le mode texte.
 */
function ligneEncadree(ligne: LigneColoree, k: number): string {
  if (ligne.couleur === null) return '';
  const demiPoints = Math.max(2, Math.round(ligne.taille * k * 2));
  const largeur = twips((ligne.largeur * 1.1 + ligne.taille) * k), hauteur = twips(ligne.taille * 1.3 * k);
  const runs = ligne.segments.map(s => '<w:r><w:rPr><w:rFonts w:ascii="' + echapper(s.police) + '" w:hAnsi="' + echapper(s.police) + '" w:cs="' + echapper(s.police) + '"/>'
    + (s.gras ? '<w:b/>' : '') + (s.italique ? '<w:i/>' : '') + '<w:color w:val="' + ligne.couleur + '"/><w:sz w:val="' + demiPoints + '"/><w:szCs w:val="' + demiPoints + '"/></w:rPr>'
    + '<w:t xml:space="preserve">' + echapper(s.texte) + '</w:t></w:r>').join('');
  return '<w:p><w:pPr><w:framePr w:w="' + largeur + '" w:h="' + hauteur + '" w:hRule="exact" w:wrap="around" w:hAnchor="page" w:vAnchor="page"'
    + ' w:x="' + twips(ligne.x * k) + '" w:y="' + twips(ligne.haut * k) + '"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' + runs + '</w:p>';
}

/** Ecrit un document Word ou chaque page reprend une page du PDF, a sa taille, son texte modifiable pose a sa place. */
export function ecrireDocxFidele(pages: readonly PageImage[]): Uint8Array {
  if (pages.length === 0) throw new RangeError('Aucune page à convertir.');
  const sansEspace = '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>';
  const corps = pages.map((p, i) => {
    const derniere = i === pages.length - 1;
    // La section d'une page se ferme sur son paragraphe ; celle de la derniere est celle du corps.
    const k = bornerTaille(p.largeur, p.hauteur, PAGE_MIN, PAGE_MAX).largeur / Math.max(1, p.largeur);
    // Les cadres d'abord : un cadre s'ancre au paragraphe qui le suit, celui du fond, sur la meme page.
    return (p.lignes ?? []).map(l => ligneEncadree(l, k)).join('') + '<w:p><w:pPr>' + sansEspace + (derniere ? '' : section(p.largeur, p.hauteur, 0)) + '</w:pPr>' + imageAncree(i + 1, 'rId' + (i + 2), p.largeur, p.hauteur) + '</w:p>'
      + (derniere ? section(p.largeur, p.hauteur, 0) : '');
  }).join('');
  return paquetWord(corps, pages.map((p, i) => ['page-' + (i + 1) + '.' + p.format, p.image] as const));
}

/** Ecrit un document Word du texte des pages, en paragraphes ; chaque page du PDF commence une page Word. */
export function ecrireDocxTexte(pages: readonly PageTexte[]): Uint8Array {
  const premiere = pages[0];
  if (premiere === undefined) throw new RangeError('Aucune page à convertir.');
  // Le premier paragraphe d'une page du PDF ouvre une page Word (pageBreakBefore) : un saut de page dans un
  // paragraphe a lui laisserait une ligne vide en haut de chaque page. Une tabulation (les colonnes d'une rangee
  // reconnue par l'OCR) devient une vraie tabulation Word.
  const paragraphe = (texte: string, nouvellePage: boolean) => '<w:p>' + (nouvellePage ? '<w:pPr><w:pageBreakBefore/></w:pPr>' : '')
    + (texte === '' ? '' : '<w:r>' + texte.split('\t').map(t => '<w:t xml:space="preserve">' + echapper(t) + '</w:t>').join('<w:tab/>') + '</w:r>') + '</w:p>';
  const corps = pages.map((p, i) => (p.paragraphes.length > 0 ? p.paragraphes : ['']).map((t, k) => paragraphe(t, i > 0 && k === 0)).join('')).join('');
  // Une taille de page pour tout le document : celle de la premiere page, avec des marges de 2 cm.
  return paquetWord(corps + section(premiere.largeur, premiere.hauteur, 56.7), []);
}
