// Le cliquet de rigueur. La configuration stricte est en place des le premier jour : le cliquet
// est le rapport par dossier, et la garde contre une regression dans l'un d'eux.
//
// `tsconfig.json` ne sait pas faire cette garde lui-meme : restreindre `include` ne restreint rien,
// puisque les fichiers importes entrent quand meme dans le programme. D'ou ce script : il lance
// `tsc`, et **echoue si une erreur vient d'un dossier declare propre**.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

// On lance le script `tsc` du paquet avec le Node courant, sans passer par un shell : `npx` est un
// `.cmd` sous Windows et exigeait `shell: true`, que Node 22 signale comme une faille d'échappement.
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc');

/** Des drapeaux en plus de tsconfig.json pour un barreau a l'essai. Vide : la cible est atteinte. */
const DRAPEAUX = [];

/**
 * Tous les dossiers de `src/`, reserves compris, plus `tests/` comme un seul bloc : aucun n'a jamais
 * eu le droit d'etre sale, et aucun ne le deviendra sans que ce script le remarque.
 */
const PROPRES = ['util', 'shell', 'geometry', 'model', 'plateforme', 'engine', 'core', 'io', 'render', 'export', 'interaction', 'ui', 'app', 'zones', 'tests'];

const sortie = (() => {
  try {
    execFileSync(process.execPath, [TSC, '--noEmit', ...DRAPEAUX], { encoding: 'utf8' });
    return '';
  } catch (e) {
    return String(e.stdout || '');
  }
})();

const erreurs = sortie.split('\n').filter(l => /error TS/.test(l));
const dossierDe = (ligne) => {
  const mSrc = /^src[/\\](\w+)[/\\]/.exec(ligne);
  if (mSrc) return mSrc[1];
  // `tests/` n'est pas subdivisé comme `src/` : un seul bloc, pas un sous-dossier par sous-dossier.
  if (/^tests[/\\]/.test(ligne)) return 'tests';
  return null;
};

const regressions = erreurs.filter(l => PROPRES.includes(dossierDe(l)));
const parDossier = new Map();
for (const l of erreurs) {
  const d = dossierDe(l) || 'ailleurs';
  parDossier.set(d, (parDossier.get(d) || 0) + 1);
}

const largeur = Math.max(...[...parDossier.keys()].map(d => d.length), 8);
console.log(`Cliquet de rigueur — ${DRAPEAUX.length ? DRAPEAUX.join(' ') : 'configuration de tsconfig.json'}\n`);
console.log('  propres : ' + PROPRES.join(', ') + '\n');
for (const [d, n] of [...parDossier.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d.padEnd(largeur)} ${String(n).padStart(5)}`);
}
console.log(`\n  total ${erreurs.length}\n`);

if (regressions.length) {
  console.error(`ÉCHEC : ${regressions.length} erreur(s) dans un dossier déclaré propre.\n`);
  for (const l of regressions.slice(0, 20)) console.error('  ' + l.trim());
  process.exit(1);
}
console.log('Aucune régression dans les dossiers propres.');
