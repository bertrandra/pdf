// Construit la page : un seul fichier HTML qui embarque le moteur, et pdf.js a cote, dans dist/pdfjs/, charge a la
// demande au premier apercu (src/io/apercu.ts). pdf.js est recopie tel que le paquet epingle le livre, jamais
// recompile : sa version est celle de package-lock.json.
//
// L'OCR suit la meme regle (ADR-0007) : tesseract.js, son travailleur et son coeur sans SIMD sont recopies dans
// dist/ocr/, les modeles verifies par scripts/modeles-ocr.mjs.
//
//   npm run construire   -> dist/pdf.html, dist/pdfjs/pdf.min.mjs, dist/pdfjs/pdf.worker.min.mjs, dist/ocr/

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { annoncer, depuisRacine, ecrireDansDist, empaqueter, enKo, refuserFinDeScript } from './aide.mjs';
import { copierModeles } from './modeles-ocr.mjs';

/** Les reperes que page.html doit porter, dans l'ordre ou ils sont remplaces. */
export const REPERES_PAGE = ['/*JETONS*/', '/*STYLE*/', '/*MOTEUR*/'];

/** Le CSS des jetons, tel que le registre le genere : on compile le registre et on l'importe. */
async function cssDesJetons() {
  const code = await empaqueter({ entryPoints: [depuisRacine('src/styles/jetons.ts')], bundle: true, format: 'esm', target: 'es2020' });
  const { cssJetons } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
  return cssJetons();
}

const moteur = await empaqueter({
  entryPoints: [depuisRacine('outils/pdf/entree.tsx')],
  bundle: true, format: 'iife', target: 'es2020', minify: true, jsx: 'automatic',
  // pdf.js n'entre pas dans le moteur : il se charge par une adresse calculee (io/apercu.ts).
  external: ['pdfjs-dist'],
  define: { 'process.env.NODE_ENV': '"production"' }
});
// Un `</script` dans le moteur fermerait la balise qui l'embarque.
refuserFinDeScript(moteur, 'le moteur');

const page = readFileSync(depuisRacine('outils/pdf/page.html'), 'utf8');
for (const repere of REPERES_PAGE) {
  if (!page.includes(repere)) throw new Error('page.html ne porte plus le repere ' + repere);
}
const style = readFileSync(depuisRacine('outils/pdf/page.css'), 'utf8');
const jetons = await cssDesJetons();
// Des fonctions de remplacement : le texte insere contient des `$` que String.replace lirait.
const complete = page.replace('/*JETONS*/', () => jetons).replace('/*STYLE*/', () => style).replace('/*MOTEUR*/', () => moteur);
ecrireDansDist('pdf.html', complete);
annoncer('Page construite', 'pdf.html', enKo(moteur.length) + ' Ko de moteur, ' + enKo(complete.length) + ' Ko en tout');

mkdirSync(depuisRacine('dist/pdfjs'), { recursive: true });
for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) copyFileSync(depuisRacine('node_modules/pdfjs-dist/build', f), depuisRacine('dist/pdfjs', f));
const version = JSON.parse(readFileSync(depuisRacine('node_modules/pdfjs-dist/package.json'), 'utf8')).version;
annoncer('pdf.js recopié', 'pdfjs/', 'version ' + version);

// Le coeur sans SIMD : les modeles en virgule flottante n'ont pas de produit scalaire dans les coeurs SIMD (io/ocr.ts).
const tesseract = depuisRacine('node_modules/tesseract.js');
const coeur = depuisRacine('node_modules/tesseract.js/node_modules/tesseract.js-core');
mkdirSync(depuisRacine('dist/ocr'), { recursive: true });
for (const [dossier, f] of [[tesseract + '/dist', 'tesseract.min.js'], [tesseract + '/dist', 'worker.min.js'], [coeur, 'tesseract-core-lstm.wasm.js']]) {
  copyFileSync(dossier + '/' + f, depuisRacine('dist/ocr', f));
}
const versionOcr = JSON.parse(readFileSync(tesseract + '/package.json', 'utf8')).version;
annoncer('tesseract.js recopié', 'ocr/', 'version ' + versionOcr);
await copierModeles();
