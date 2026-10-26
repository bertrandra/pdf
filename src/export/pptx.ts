// La conversion en PowerPoint (ADR-0005, ADR-0006) : une diapositive par page, entiere et centree. Le fond est la page
// dessinee sans son texte ; chaque ligne de texte s'y pose en zone modifiable, a sa place, avec sa police, sa taille,
// son gras, son italique et sa couleur. Une page sans texte lisible (un scan) reste une image. Le fichier est le plus petit que PowerPoint, LibreOffice et Keynote ouvrent sans
// le reparer : un masque, une disposition vide, un theme, et les diapositives.
//
// Une presentation n'a qu'une taille de diapositive : celle de la premiere page, bornee a ce que PowerPoint admet
// (de 1 a 56 pouces). Une page d'une autre taille s'y pose entiere, centree, sans deformation.

import { au } from '../util/tableaux.js';
import { bornerTaille, echapper, emu, ENTETE, NS_A, NS_REL_DOC, paquet, relations, typesDeContenu, type LigneColoree, type PageImage } from './ooxml.js';

const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const ESPACES = 'xmlns:a="' + NS_A + '" xmlns:r="' + NS_REL_DOC + '" xmlns:p="' + NS_P + '"';
const TYPE_PML = 'application/vnd.openxmlformats-officedocument.presentationml.';

/** Les bornes d'une diapositive, en points : 1 et 56 pouces. */
const DIAPO_MIN = 72, DIAPO_MAX = 56 * 72;

/** L'arbre de formes vide qui ouvre tout `p:spTree`. */
const RACINE_ARBRE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
  + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const COULEURS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
const VALEURS = ['000000', 'FFFFFF', '1F2937', 'E5E7EB', '00719C', 'A8322A', '8A5A00', '3B7D3A', '6B4C9A', '555C66', '00719C', '6B4C9A'];

/** Le theme : obligatoire derriere un masque, et reduit a ce que le schema exige (trois styles de chaque sorte). */
function theme(): string {
  const trois = (x: string) => x + x + x;
  const plein = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return ENTETE + '<a:theme xmlns:a="' + NS_A + '" name="pdf"><a:themeElements>'
    + '<a:clrScheme name="pdf">' + COULEURS.map((c, i) => '<a:' + c + '><a:srgbClr val="' + au(VALEURS, i) + '"/></a:' + c + '>').join('') + '</a:clrScheme>'
    + '<a:fontScheme name="pdf"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
    + '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>'
    + '<a:fmtScheme name="pdf"><a:fillStyleLst>' + trois(plein) + '</a:fillStyleLst>'
    + '<a:lnStyleLst>' + trois('<a:ln w="6350">' + plein + '</a:ln>') + '</a:lnStyleLst>'
    + '<a:effectStyleLst>' + trois('<a:effectStyle><a:effectLst/></a:effectStyle>') + '</a:effectStyleLst>'
    + '<a:bgFillStyleLst>' + trois(plein) + '</a:bgFillStyleLst></a:fmtScheme>'
    + '</a:themeElements></a:theme>';
}

function masque(): string {
  return ENTETE + '<p:sldMaster ' + ESPACES + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'
    + '<p:spTree>' + RACINE_ARBRE + '</p:spTree></p:cSld>'
    + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
}

function disposition(): string {
  return ENTETE + '<p:sldLayout ' + ESPACES + ' type="blank" preserve="1"><p:cSld name="Vide"><p:spTree>' + RACINE_ARBRE + '</p:spTree></p:cSld>'
    + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
}

/**
 * Une ligne de texte en zone modifiable, a sa place sur la page mise a l'echelle `k` et decalee de (dx, dy) : sans
 * marge interieure, sans retour a la ligne ni ajustement automatique, pour que la ligne de base tombe ou elle etait.
 * Un texte invisible (la couche OCR d'un scan) reste selectionnable et modifiable, mais transparent.
 */
function zoneDeTexte(ligne: LigneColoree, id: number, k: number, dx: number, dy: number): string {
  const taille = Math.max(100, Math.min(400_000, Math.round(ligne.taille * k * 100)));
  const couleur = '<a:solidFill><a:srgbClr val="' + (ligne.couleur ?? '000000') + '">' + (ligne.couleur === null ? '<a:alpha val="0"/>' : '') + '</a:srgbClr></a:solidFill>';
  const runs = ligne.segments.map(s => '<a:r><a:rPr lang="fr-FR" sz="' + taille + '" b="' + (s.gras ? 1 : 0) + '" i="' + (s.italique ? 1 : 0) + '" dirty="0">' + couleur
    + '<a:latin typeface="' + echapper(s.police) + '"/><a:cs typeface="' + echapper(s.police) + '"/></a:rPr><a:t>' + echapper(s.texte) + '</a:t></a:r>').join('');
  // La boite tient la ligne avec un peu de marge : une police de remplacement plus large ne la coupe pas.
  const largeur = (ligne.largeur * 1.1 + ligne.taille) * k, hauteur = ligne.taille * 1.25 * k;
  const rotation = Math.round(ligne.angle * 60_000);
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Texte ' + (id - 2) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
    + '<p:spPr><a:xfrm' + (rotation !== 0 ? ' rot="' + rotation + '"' : '') + '><a:off x="' + emu(dx + ligne.x * k) + '" y="' + emu(dy + ligne.haut * k) + '"/>'
    + '<a:ext cx="' + emu(largeur) + '" cy="' + emu(hauteur) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
    + '<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>'
    + '<a:p><a:pPr><a:lnSpc><a:spcPct val="100000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft></a:pPr>' + runs + '</a:p></p:txBody></p:sp>';
}

/** Une diapositive : l'image de la page, ajustee a la diapositive (entiere, centree). */
function diapositive(page: PageImage, numero: number, diapo: { largeur: number; hauteur: number }): string {
  const k = Math.min(diapo.largeur / Math.max(1, page.largeur), diapo.hauteur / Math.max(1, page.hauteur));
  const l = page.largeur * k, h = page.hauteur * k;
  const nom = 'Page ' + numero;
  return ENTETE + '<p:sld ' + ESPACES + '><p:cSld><p:spTree>' + RACINE_ARBRE
    + '<p:pic><p:nvPicPr><p:cNvPr id="2" name="' + nom + '" descr="' + nom + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
    + '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
    + '<p:spPr><a:xfrm><a:off x="' + emu((diapo.largeur - l) / 2) + '" y="' + emu((diapo.hauteur - h) / 2) + '"/><a:ext cx="' + emu(l) + '" cy="' + emu(h) + '"/></a:xfrm>'
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    + (page.lignes ?? []).map((ligne, i) => zoneDeTexte(ligne, i + 3, k, (diapo.largeur - l) / 2, (diapo.hauteur - h) / 2)).join('')
    + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}

/** Ecrit la presentation. Refuse une liste vide : une presentation sans diapositive ne sert a rien. */
export function ecrirePptx(pages: readonly PageImage[]): Uint8Array {
  const premiere = pages[0];
  if (premiere === undefined) throw new RangeError('Aucune page à convertir.');
  const diapo = bornerTaille(premiere.largeur, premiere.hauteur, DIAPO_MIN, DIAPO_MAX);
  const n = pages.length;
  const numeros = pages.map((_, i) => i + 1);
  const presentation = ENTETE + '<p:presentation ' + ESPACES + ' saveSubsetFonts="1">'
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    + '<p:sldIdLst>' + numeros.map(i => '<p:sldId id="' + (255 + i) + '" r:id="rId' + (i + 2) + '"/>').join('') + '</p:sldIdLst>'
    + '<p:sldSz cx="' + emu(diapo.largeur) + '" cy="' + emu(diapo.hauteur) + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  const relationsPresentation = relations([
    { id: 'rId1', type: 'slideMaster', cible: 'slideMasters/slideMaster1.xml' },
    { id: 'rId2', type: 'theme', cible: 'theme/theme1.xml' },
    ...numeros.map(i => ({ id: 'rId' + (i + 2), type: 'slide', cible: 'slides/slide' + i + '.xml' })),
    { id: 'rId' + (n + 3), type: 'presProps', cible: 'presProps.xml' },
    { id: 'rId' + (n + 4), type: 'viewProps', cible: 'viewProps.xml' },
    { id: 'rId' + (n + 5), type: 'tableStyles', cible: 'tableStyles.xml' }
  ]);
  const types = typesDeContenu([
    ['ppt/presentation.xml', TYPE_PML + 'presentation.main+xml'],
    ['ppt/slideMasters/slideMaster1.xml', TYPE_PML + 'slideMaster+xml'],
    ['ppt/slideLayouts/slideLayout1.xml', TYPE_PML + 'slideLayout+xml'],
    ['ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
    ['ppt/presProps.xml', TYPE_PML + 'presProps+xml'],
    ['ppt/viewProps.xml', TYPE_PML + 'viewProps+xml'],
    ['ppt/tableStyles.xml', TYPE_PML + 'tableStyles+xml'],
    ...numeros.map(i => ['ppt/slides/slide' + i + '.xml', TYPE_PML + 'slide+xml'] as const)
  ]);
  return paquet(types, [
    ['_rels/.rels', relations([{ id: 'rId1', type: 'officeDocument', cible: 'ppt/presentation.xml' }])],
    ['ppt/presentation.xml', presentation],
    ['ppt/_rels/presentation.xml.rels', relationsPresentation],
    ['ppt/slideMasters/slideMaster1.xml', masque()],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', relations([
      { id: 'rId1', type: 'slideLayout', cible: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: 'theme', cible: '../theme/theme1.xml' }
    ])],
    ['ppt/slideLayouts/slideLayout1.xml', disposition()],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', relations([{ id: 'rId1', type: 'slideMaster', cible: '../slideMasters/slideMaster1.xml' }])],
    ['ppt/theme/theme1.xml', theme()],
    ['ppt/presProps.xml', ENTETE + '<p:presentationPr ' + ESPACES + '/>'],
    ['ppt/viewProps.xml', ENTETE + '<p:viewPr ' + ESPACES + '/>'],
    ['ppt/tableStyles.xml', ENTETE + '<a:tblStyleLst xmlns:a="' + NS_A + '" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'],
    ...pages.flatMap((p, i) => {
      const media = 'image' + (i + 1) + '.' + p.format;
      return [
        ['ppt/slides/slide' + (i + 1) + '.xml', diapositive(p, i + 1, diapo)] as const,
        ['ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', relations([
          { id: 'rId1', type: 'slideLayout', cible: '../slideLayouts/slideLayout1.xml' },
          { id: 'rId2', type: 'image', cible: '../media/' + media }
        ])] as const,
        ['ppt/media/' + media, p.image] as const
      ];
    })
  ]);
}
