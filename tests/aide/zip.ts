// Lire une archive ZIP « store » (celles qu'ecrit export/zip.ts) : les noms et le contenu de chaque entree, par le
// repertoire central. De quoi verifier un .pptx ou un .docx sans dependance.

export function lireZip(octets: Uint8Array): Map<string, Uint8Array> {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let fin = octets.length - 22;
  while (fin >= 0 && vue.getUint32(fin, true) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('pas une archive ZIP');
  const nombre = vue.getUint16(fin + 10, true);
  let pos = vue.getUint32(fin + 16, true);
  const sortie = new Map<string, Uint8Array>();
  for (let i = 0; i < nombre; i++) {
    const methode = vue.getUint16(pos + 10, true), taille = vue.getUint32(pos + 20, true);
    const longueurNom = vue.getUint16(pos + 28, true), extra = vue.getUint16(pos + 30, true), commentaire = vue.getUint16(pos + 32, true);
    const local = vue.getUint32(pos + 42, true);
    const nom = new TextDecoder().decode(octets.subarray(pos + 46, pos + 46 + longueurNom));
    if (methode !== 0) throw new Error('entree compressee : ' + nom);
    const debut = local + 30 + vue.getUint16(local + 26, true) + vue.getUint16(local + 28, true);
    sortie.set(nom, octets.subarray(debut, debut + taille));
    pos += 46 + longueurNom + extra + commentaire;
  }
  return sortie;
}

/** Le texte d'une entree, ou une erreur qui la nomme. */
export function texte(archive: Map<string, Uint8Array>, nom: string): string {
  const o = archive.get(nom);
  if (o === undefined) throw new Error('entree absente : ' + nom);
  return new TextDecoder().decode(o);
}
