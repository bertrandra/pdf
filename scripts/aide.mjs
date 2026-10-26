// Ce que les scripts de construction ont en commun : un seul endroit sait ou est la racine du depot,
// comment compiler un point d'entree en texte, refuser un texte qui fermerait sa balise <script>,
// ecrire dans dist/ et l'annoncer. Aucun script ne s'execute seul : on les lance par `npm run construire`
// (ou `npm run <nom>` pour un seul), ce module n'est qu'importe.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** La racine du depot, quel que soit le dossier d'ou l'on lance npm. */
export const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Un chemin sous la racine du depot. */
export const depuisRacine = (...morceaux) => join(racine, ...morceaux);

/** Compile avec esbuild sans rien ecrire, et rend le texte du premier fichier produit. */
export async function empaqueter(options) {
  const { outputFiles } = await build({ ...options, write: false });
  return outputFiles[0]?.text ?? '';
}

/**
 * Un texte destine a une balise <script> ne doit jamais contenir `</script` : il fermerait la balise
 * qui l'embarque. `quoi` ouvre le message : « le moteur », « la bibliotheque ».
 */
export function refuserFinDeScript(texte, quoi) {
  if (texte.includes('</script')) throw new Error(quoi + ' contient « </script » : la page serait coupee');
}

/** Ecrit `texte` dans dist/<nom> (le dossier se cree au besoin) et rend son chemin. */
export function ecrireDansDist(nom, texte) {
  mkdirSync(depuisRacine('dist'), { recursive: true });
  const chemin = depuisRacine('dist', nom);
  writeFileSync(chemin, texte);
  return chemin;
}

/** Le contenu d'un fichier en base64, pour l'embarquer dans un script. */
export const base64DeFichier = chemin => readFileSync(chemin).toString('base64');

/** Des octets (ou des caracteres) en Ko arrondis, pour les lignes de journal. */
export const enKo = taille => Math.round(taille / 1024);

/** La ligne de journal d'une construction : « Titre : dist/fichier (detail). » */
export const annoncer = (titre, fichier, detail) => console.log(titre + ' : dist/' + fichier + ' (' + detail + ').');

/** Vrai quand le module est le script lance (`node scripts/x.mjs`), faux quand un test ou un autre script l'importe. */
export const estLance = urlDuModule => Boolean(process.argv[1]) && fileURLToPath(urlDuModule) === process.argv[1];
