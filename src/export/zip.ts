// Une archive ZIP sans compression (methode « store »), ecrite a la main : de quoi remettre les parties d'une scission
// en un seul fichier, sans dependance. Pur et reproductible : l'horodatage de chaque entree est fixe au
// 1er janvier 1980 (le plus petit que le format sache dire), donc les memes entrees rendent les memes octets,
// aujourd'hui comme demain. Les noms sont en UTF-8 (drapeau 11). Pas de ZIP64 : au-dela de 4 Gio ou de
// 65 535 entrees, l'ecriture est refusee avec une phrase qui le dit.
//
// Disposition : [entete local + nom + donnees] x N, puis le repertoire central (un enregistrement par
// entree), puis la fin du repertoire central. Tous les entiers sont petit-boutistes.

export interface EntreeZip {
  /** Le nom dans l'archive ; voir `nomsUniques` pour des noms sans doublon. */
  nom: string;
  donnees: Uint8Array;
}

/** Un refus nomme : ce que le format ne sait pas porter, dit en francais. */
export class ErreurZip extends Error {
  constructor(message: string) { super(message); this.name = 'ErreurZip'; }
}

const LIMITE_OCTETS = 0xffffffff;
const LIMITE_ENTREES = 0xffff;
/** 1er janvier 1980, 00:00:00 : heure DOS 0, date DOS (annee 0 depuis 1980, mois 1, jour 1). */
const HEURE_DOS = 0;
const DATE_DOS = (0 << 9) | (1 << 5) | 1;
const DRAPEAU_UTF8 = 0x0800;
/** Version necessaire pour extraire : 2.0 (le plus bas qui accepte les noms UTF-8 declares). */
const VERSION = 20;

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** Le CRC-32 (IEEE 802.3, polynome 0xEDB88320) des octets, comme le calcule zip : un entier non signe. */
export function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = (TABLE_CRC[(c ^ (octets[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Un nom d'entree sur : sans separateur de dossier ni caractere que les systemes de fichiers refusent, sans
 * point ou espace au bord. Un nom qui s'efface entierement devient « fichier ».
 */
export function nomSur(nom: string): string {
  // eslint-disable-next-line no-control-regex
  const propre = nom.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  return propre || 'fichier';
}

/**
 * Des noms sans doublon (casse comprise : deux noms qui ne different que par la casse se heurtent sous
 * Windows et macOS) : le deuxieme « logo.svg » devient « logo-2.svg », le troisieme « logo-3.svg ».
 */
export function nomsUniques(noms: readonly string[]): string[] {
  const pris = new Set<string>();
  return noms.map(brut => {
    const nom = nomSur(brut), point = nom.lastIndexOf('.');
    const racine = point > 0 ? nom.slice(0, point) : nom, extension = point > 0 ? nom.slice(point) : '';
    let candidat = nom, n = 1;
    while (pris.has(candidat.toLowerCase())) candidat = racine + '-' + ++n + extension;
    pris.add(candidat.toLowerCase());
    return candidat;
  });
}

/** Ecrit l'archive. Refuse (ErreurZip) ce que le ZIP classique ne porte pas. */
export function ecrireZip(entrees: readonly EntreeZip[]): Uint8Array {
  if (entrees.length > LIMITE_ENTREES) throw new ErreurZip('Trop de fichiers pour une archive ZIP : ' + entrees.length + ' (au plus ' + LIMITE_ENTREES + ').');
  const encodeur = new TextEncoder();
  const noms = entrees.map(e => encodeur.encode(e.nom));
  const doublon = noms.findIndex((n, i) => noms.slice(0, i).some(m => m.length === n.length && m.every((o, k) => o === n[k])));
  if (doublon >= 0) throw new ErreurZip('Deux fichiers portent le nom « ' + (entrees[doublon]?.nom ?? '') + ' » : donnez-leur des noms différents.');
  let total = 22;
  entrees.forEach((e, i) => {
    const n = noms[i] ?? new Uint8Array();
    if (n.length > 0xffff) throw new ErreurZip('Le nom « ' + e.nom.slice(0, 40) + '… » est trop long pour une archive ZIP.');
    total += 30 + n.length + e.donnees.length + 46 + n.length;
  });
  if (total > LIMITE_OCTETS) throw new ErreurZip('Archive trop grosse : plus de 4 Go, ce que le format ZIP simple ne porte pas. Téléchargez les fichiers par lots plus petits.');
  const sortie = new Uint8Array(total), vue = new DataView(sortie.buffer);
  let pos = 0;
  const e16 = (v: number) => { vue.setUint16(pos, v, true); pos += 2; };
  const e32 = (v: number) => { vue.setUint32(pos, v, true); pos += 4; };
  const octets = (b: Uint8Array) => { sortie.set(b, pos); pos += b.length; };
  const crcs = entrees.map(e => crc32(e.donnees));
  const decalages: number[] = [];
  entrees.forEach((e, i) => {
    decalages.push(pos);
    e32(0x04034b50); e16(VERSION); e16(DRAPEAU_UTF8); e16(0); e16(HEURE_DOS); e16(DATE_DOS);
    e32(crcs[i] ?? 0); e32(e.donnees.length); e32(e.donnees.length); e16(noms[i]?.length ?? 0); e16(0);
    octets(noms[i] ?? new Uint8Array()); octets(e.donnees);
  });
  const debutCentral = pos;
  entrees.forEach((e, i) => {
    e32(0x02014b50); e16(VERSION); e16(VERSION); e16(DRAPEAU_UTF8); e16(0); e16(HEURE_DOS); e16(DATE_DOS);
    e32(crcs[i] ?? 0); e32(e.donnees.length); e32(e.donnees.length); e16(noms[i]?.length ?? 0);
    e16(0); e16(0); e16(0); e16(0); e32(0); e32(decalages[i] ?? 0);
    octets(noms[i] ?? new Uint8Array());
  });
  const tailleCentral = pos - debutCentral;
  e32(0x06054b50); e16(0); e16(0); e16(entrees.length); e16(entrees.length); e32(tailleCentral); e32(debutCentral); e16(0);
  return sortie;
}
