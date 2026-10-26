// La page construite, mise en forme d'artefact claude.ai : l'hote enveloppe lui-meme le document (doctype, <html>,
// <head> avec charset et viewport), on ne lui donne donc que le titre, les styles et le corps. Les fichiers charges a
// la demande (pdfjs/, ocr/) se publient a cote, aux memes chemins que dans dist/. Rien d'autre ne change : un
// artefact ne lance pas de telechargement lui-meme, et io/fichiers.ts passe alors par la capacite `downloads`.
//
//   npm run construire && node scripts/artefact.mjs   -> dist/artefact/index.html

import { mkdirSync, readFileSync } from 'node:fs';
import { annoncer, depuisRacine, ecrireDansDist, enKo } from './aide.mjs';

/** Le nom de l'outil dans la galerie et l'onglet : un nom, pas une explication. */
export const TITRE_ARTEFACT = 'Atelier PDF';

const page = readFileSync(depuisRacine('dist/pdf.html'), 'utf8');
const style = /<style>[\s\S]*<\/style>/.exec(page)?.[0];
const corps = /<body>([\s\S]*)<\/body>/.exec(page)?.[1];
if (style === undefined || corps === undefined) throw new Error('dist/pdf.html ne porte plus de <style> ou de <body> : relancer npm run construire');
const artefact = '<title>' + TITRE_ARTEFACT + '</title>\n' + style + '\n' + corps.trim() + '\n';
mkdirSync(depuisRacine('dist/artefact'), { recursive: true });
ecrireDansDist('artefact/index.html', artefact);
annoncer('Page d’artefact', 'artefact/index.html', enKo(artefact.length) + ' Ko');
