// Les modeles de reconnaissance de caracteres (ADR-0007) : tessdata_best, la version en virgule flottante des
// modeles LSTM de Tesseract, la plus juste. Ils ne sont publies sur aucun registre de paquets : on les prend a une
// etiquette fixe du depot officiel, et chaque fichier est verifie par sa taille et son sha256 (data/modeles-ocr.json)
// avant d'entrer dans dist/. Un fichier deja telecharge et verifie se garde dans .cache/ocr/ (ignore par git) :
// la construction suivante ne touche plus au reseau. Un fichier qui ne correspond pas fait echouer la construction,
// jamais une page qui reconnaitrait autre chose que ce qui a ete mesure.
//
// Les modeles partent compresses (gzip, que tesseract.js decompresse) : un tiers de moins a charger, et le modele
// anglais (15,4 Mo) passe sous les 15 Mo par fichier d'un artefact. La compression est reproductible : zlib ecrit
// une date nulle dans l'en-tete gzip, donc les memes modeles rendent les memes octets.
//
// Chaque modele a son manifeste (`<langue>.json`, lu par src/io/ocr.ts) : ici, un seul fichier gzip. Un artefact
// claude.ai ne sert pas de fichier .gz : scripts/artefact.mjs y ecrit le meme modele en morceaux de texte base64,
// avec un manifeste qui le dit, et la page n'a rien d'autre a savoir.
//
//   node scripts/modeles-ocr.mjs   -> dist/ocr/langues/{fra,eng}.traineddata.gz et {fra,eng}.json

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants, gzipSync } from 'node:zlib';
import { annoncer, depuisRacine, enKo, estLance } from './aide.mjs';

const registre = JSON.parse(readFileSync(depuisRacine('data/modeles-ocr.json'), 'utf8'));

const empreinte = octets => createHash('sha256').update(octets).digest('hex');
const conforme = (octets, m) => octets.length === m.octets && empreinte(octets) === m.sha256;

/** Le modele d'une langue : du cache s'il y est et qu'il est conforme, du depot officiel sinon. */
async function modele(m) {
  const cache = depuisRacine('.cache/ocr', m.langue + '.traineddata');
  if (existsSync(cache)) {
    const octets = readFileSync(cache);
    if (conforme(octets, m)) return octets;
  }
  const url = 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/' + registre.etiquette + '/' + m.langue + '.traineddata';
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error('Modèle OCR « ' + m.langue + ' » introuvable (' + reponse.status + ') : ' + url);
  const octets = Buffer.from(await reponse.arrayBuffer());
  if (!conforme(octets, m)) throw new Error('Modèle OCR « ' + m.langue + ' » non conforme : ' + octets.length + ' octets, sha256 ' + empreinte(octets) + '.');
  mkdirSync(depuisRacine('.cache/ocr'), { recursive: true });
  writeFileSync(cache, octets);
  return octets;
}

/** Ecrit les modeles, compresses, dans dist/ocr/langues/. */
/** Les langues du registre, dans l'ordre. */
export const LANGUES = registre.modeles.map(m => m.langue);

export async function copierModeles() {
  mkdirSync(depuisRacine('dist/ocr/langues'), { recursive: true });
  let total = 0;
  for (const m of registre.modeles) {
    const octets = await modele(m);
    const compresse = gzipSync(octets, { level: constants.Z_BEST_COMPRESSION });
    writeFileSync(depuisRacine('dist/ocr/langues', m.langue + '.traineddata.gz'), compresse);
    writeFileSync(depuisRacine('dist/ocr/langues', m.langue + '.json'), JSON.stringify({ codage: 'gzip', parties: [m.langue + '.traineddata.gz'] }));
    total += compresse.length;
  }
  annoncer('Modèles OCR vérifiés', 'ocr/langues/', registre.modeles.map(m => m.langue).join(', ') + ', tessdata_best ' + registre.etiquette + ', ' + enKo(total) + ' Ko compressés');
}

if (estLance(import.meta.url)) await copierModeles();
