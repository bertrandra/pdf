// La page construite, mise en forme d'artefact claude.ai : l'hote enveloppe lui-meme le document (doctype, <html>,
// <head> avec charset et viewport), on ne lui donne donc que le titre, les styles et le corps. Les fichiers charges a
// la demande (pdfjs/, ocr/) sont recopies a cote, aux memes chemins : dist/artefact/ est tout ce qui se publie. Un
// artefact ne lance pas de telechargement lui-meme : io/fichiers.ts passe alors par la capacite `downloads`.
//
// L'hote refuse un fichier texte qui porte un caractere de controle brut (ESC et ses voisins) ; pdf.js et pdf-lib en
// ont quelques-uns dans leurs chaines. Chacun devient son echappement \uXXXX, qui veut dire la meme chose dans une
// chaine ou une expression reguliere, la seule place ou un tel caractere peut se trouver dans du JavaScript.
//
//   npm run artefact   -> dist/artefact/ (index.html, pdfjs/, ocr/)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { annoncer, depuisRacine, ecrireDansDist, enKo } from './aide.mjs';
import { LANGUES } from './modeles-ocr.mjs';

/** Le nom de l'outil dans la galerie et l'onglet : un nom, pas une explication. */
export const TITRE_ARTEFACT = 'Atelier PDF';

/** Le texte sans caractere de controle brut (tabulation et fins de ligne exceptees). */
// eslint-disable-next-line no-control-regex
export const sansControles = texte => texte.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

const page = sansControles(readFileSync(depuisRacine('dist/pdf.html'), 'utf8'));
const style = /<style>[\s\S]*<\/style>/.exec(page)?.[0];
const corps = /<body>([\s\S]*)<\/body>/.exec(page)?.[1];
if (style === undefined || corps === undefined) throw new Error('dist/pdf.html ne porte plus de <style> ou de <body> : relancer npm run construire');
const artefact = '<title>' + TITRE_ARTEFACT + '</title>\n' + style + '\n' + corps.trim() + '\n';
mkdirSync(depuisRacine('dist/artefact'), { recursive: true });
ecrireDansDist('artefact/index.html', artefact);
annoncer('Page d’artefact', 'artefact/index.html', enKo(artefact.length) + ' Ko');

// Les fichiers charges a la demande : les scripts nettoyes, les modeles (binaires, compresses) tels quels.
const scripts = ['pdfjs/pdf.min.js', 'pdfjs/pdf.worker.min.js', 'ocr/tesseract.min.js', 'ocr/worker.min.js', 'ocr/tesseract-core-lstm.wasm.js'];
for (const f of scripts) {
  mkdirSync(dirname(depuisRacine('dist/artefact', f)), { recursive: true });
  writeFileSync(depuisRacine('dist/artefact', f), sansControles(readFileSync(depuisRacine('dist', f), 'utf8')));
}
// Les modeles : un artefact ne sert pas de .gz, et un fichier texte y pese 16 Mo au plus. Chaque modele compresse
// s'ecrit en base64, coupe en morceaux de 8 Mo de texte, avec le manifeste que lit src/io/ocr.ts.
const MORCEAU = 8 * 1024 * 1024;
mkdirSync(depuisRacine('dist/artefact/ocr/langues'), { recursive: true });
let morceaux = 0;
for (const langue of LANGUES) {
  const texte = readFileSync(depuisRacine('dist/ocr/langues', langue + '.traineddata.gz')).toString('base64');
  const parties = [];
  for (let i = 0; i * MORCEAU < texte.length; i++) {
    const nom = langue + '-' + (i + 1) + '.txt';
    writeFileSync(depuisRacine('dist/artefact/ocr/langues', nom), texte.slice(i * MORCEAU, (i + 1) * MORCEAU));
    parties.push(nom);
  }
  writeFileSync(depuisRacine('dist/artefact/ocr/langues', langue + '.json'), JSON.stringify({ codage: 'base64-gzip', parties }));
  morceaux += parties.length;
}
annoncer('Fichiers de l’artefact', 'artefact/', scripts.length + ' scripts, ' + LANGUES.length + ' modèles en ' + morceaux + ' morceaux de texte');
