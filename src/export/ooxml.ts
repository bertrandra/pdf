// Ce que PowerPoint (pptx.ts) et Word (docx.ts) partagent : un fichier Office Open XML est une archive ZIP de
// parties XML reliees par des relations (OPC, ECMA-376 partie 2). On l'ecrit a la main, comme le ZIP : pas de
// dependance, et les memes entrees rendent les memes octets (ni date, ni auteur, ni identifiant tire). Les parties
// facultatives qui porteraient une date (docProps/core.xml) ne sont pas ecrites.

import { ecrireZip } from './zip.js';

/** Une page a convertir en image : sa taille vue en points PDF, et l'image deja dessinee (io/conversion.ts). */
export interface PageImage {
  readonly largeur: number;
  readonly hauteur: number;
  readonly image: Uint8Array;
  readonly format: 'jpeg' | 'png';
}

/** Un point PDF (1/72 de pouce) en EMU, l'unite de DrawingML : 914 400 par pouce, donc 12 700 par point. */
export const EMU_PAR_POINT = 12_700;

export const emu = (points: number): number => Math.round(points * EMU_PAR_POINT);

/** Un texte sur dans un contenu ou un attribut XML. Les caracteres que XML 1.0 interdit sont retires. */
export function echapper(texte: string): string {
  return texte
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const ENTETE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const NS_REL_PAQUET = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';

/** Une relation : son identifiant, son type (la fin de l'URI des types de relation Office) et sa cible. */
export interface Relation { readonly id: string; readonly type: string; readonly cible: string }

/** Une partie de relations (`_rels/*.rels`). */
export function relations(liste: readonly Relation[]): string {
  return ENTETE + '<Relationships xmlns="' + NS_REL_PAQUET + '">'
    + liste.map(r => '<Relationship Id="' + r.id + '" Type="' + NS_REL_DOC + '/' + r.type + '" Target="' + echapper(r.cible) + '"/>').join('')
    + '</Relationships>';
}

/** La partie `[Content_Types].xml` : les types par extension (images, relations, xml) et par partie. */
export function typesDeContenu(parties: ReadonlyArray<readonly [string, string]>): string {
  return ENTETE + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + parties.map(([nom, type]) => '<Override PartName="/' + nom + '" ContentType="' + type + '"/>').join('')
    + '</Types>';
}

/**
 * L'archive : `[Content_Types].xml` d'abord (certains lecteurs le cherchent en tete), puis les parties dans l'ordre
 * donne. Le texte s'ecrit en UTF-8.
 */
export function paquet(types: string, parties: ReadonlyArray<readonly [string, string | Uint8Array]>): Uint8Array {
  const encodeur = new TextEncoder();
  return ecrireZip([
    { nom: '[Content_Types].xml', donnees: encodeur.encode(types) },
    ...parties.map(([nom, contenu]) => ({ nom, donnees: typeof contenu === 'string' ? encodeur.encode(contenu) : contenu }))
  ]);
}

/**
 * Ramene une taille dans des bornes en gardant ses proportions : reduite si elle depasse `max` d'un cote, agrandie
 * si elle passe sous `min` de l'autre. Les deux formats bornent la taille d'une page ou d'une diapositive.
 */
export function bornerTaille(largeur: number, hauteur: number, min: number, max: number): { largeur: number; hauteur: number } {
  const l = largeur > 0 ? largeur : min, h = hauteur > 0 ? hauteur : min;
  // Agrandir jusqu'a `min` sur le petit cote, sans jamais depasser `max` sur le grand : le grand cote l'emporte.
  const k = Math.min(max / Math.max(l, h), Math.max(1, min / Math.min(l, h)));
  return { largeur: l * k, hauteur: h * k };
}
