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

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { annoncer, depuisRacine, ecrireDansDist, enKo } from './aide.mjs';

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
const scripts = ['pdfjs/pdf.min.mjs', 'pdfjs/pdf.worker.min.mjs', 'ocr/tesseract.min.js', 'ocr/worker.min.js', 'ocr/tesseract-core-lstm.wasm.js'];
const binaires = ['ocr/langues/fra.traineddata.gz', 'ocr/langues/eng.traineddata.gz'];
for (const f of [...scripts, ...binaires]) mkdirSync(dirname(depuisRacine('dist/artefact', f)), { recursive: true });
for (const f of scripts) writeFileSync(depuisRacine('dist/artefact', f), sansControles(readFileSync(depuisRacine('dist', f), 'utf8')));
for (const f of binaires) copyFileSync(depuisRacine('dist', f), depuisRacine('dist/artefact', f));
annoncer('Fichiers de l’artefact', 'artefact/', scripts.length + ' scripts, ' + binaires.length + ' modèles');
