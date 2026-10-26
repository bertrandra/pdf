// Un PDF chiffre temoin, ecrit a la main : une page vide, protegee par le gestionnaire standard (revision 2, RC4 sur
// 40 bits, PDF 32000 7.6.3). Sans mot de passe d'ouverture, il s'ouvre partout mais pdf-lib refuse de le lire, comme
// un releve bancaire protege « contre la modification » ; avec, il demande son mot de passe. Il n'a ni chaine ni flux :
// rien a chiffrer, seule la verification du mot de passe compte.

import { createHash } from 'node:crypto';

const REMPLISSAGE = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');

const rempli = (mot: string): Buffer => Buffer.concat([Buffer.from(mot, 'latin1'), REMPLISSAGE]).subarray(0, 32);
const md5 = (...parties: Buffer[]): Buffer => createHash('md5').update(Buffer.concat(parties)).digest();

function rc4(cle: Buffer, donnees: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) { j = (j + (s[i] ?? 0) + (cle[i % cle.length] ?? 0)) & 255; [s[i], s[j]] = [s[j] ?? 0, s[i] ?? 0]; }
  const sortie = Buffer.alloc(donnees.length);
  for (let k = 0, i = 0, j = 0; k < donnees.length; k++) {
    i = (i + 1) & 255; j = (j + (s[i] ?? 0)) & 255; [s[i], s[j]] = [s[j] ?? 0, s[i] ?? 0];
    sortie[k] = (donnees[k] ?? 0) ^ (s[((s[i] ?? 0) + (s[j] ?? 0)) & 255] ?? 0);
  }
  return sortie;
}

/** Un PDF d'une page, chiffre ; `motDePasse` vide : il s'ouvre sans rien demander. */
export function pdfChiffre(motDePasse = ''): Uint8Array {
  const id = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
  const p = -44; // Permissions : impression seulement.
  const o = rc4(md5(rempli('proprietaire')).subarray(0, 5), rempli(motDePasse));
  const pLe = Buffer.alloc(4); pLe.writeInt32LE(p);
  const cle = md5(rempli(motDePasse), o, pLe, id).subarray(0, 5);
  const u = rc4(cle, REMPLISSAGE);
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
    '<< /Filter /Standard /V 1 /R 2 /O <' + o.toString('hex') + '> /U <' + u.toString('hex') + '> /P ' + p + ' >>'
  ];
  let texte = '%PDF-1.4\n';
  const positions: number[] = [];
  objets.forEach((o, i) => { positions.push(Buffer.byteLength(texte, 'latin1')); texte += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = Buffer.byteLength(texte, 'latin1');
  texte += 'xref\n0 ' + (objets.length + 1) + '\n0000000000 65535 f \n' + positions.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  texte += 'trailer\n<< /Size ' + (objets.length + 1) + ' /Root 1 0 R /Encrypt 4 0 R /ID [<' + id.toString('hex') + '> <' + id.toString('hex') + '>] >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Uint8Array(Buffer.from(texte, 'latin1'));
}
