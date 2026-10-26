// Sert dist/ en local : la page charge pdf.js en module, ce qu'un navigateur refuse depuis file://.
//
//   npm run construire && npm run servir   -> http://localhost:5299/pdf.html

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { depuisRacine, estLance } from './aide.mjs';

// Les seuls types qu'un hebergeur ordinaire connait a coup sur. Une autre extension part sans Content-Type, comme
// chez SiteGround pour .mjs : les tests de navigateur voient alors ce que voit la personne, et un fichier que le
// navigateur refuserait (un module sans type JavaScript) les fait echouer ici d'abord.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.pdf': 'application/pdf', '.wasm': 'application/wasm' };

/** Un serveur de dist/ (ou d'un autre dossier) ; rend le serveur, a fermer par l'appelant. */
export function servir(port = 5299, dossier = depuisRacine('dist')) {
  const serveur = createServer(async (req, res) => {
    const chemin = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (chemin.startsWith('..')) { res.writeHead(403).end(); return; }
    try {
      const corps = await readFile(join(dossier, chemin || 'pdf.html'));
      const type = TYPES[extname(chemin)];
      res.writeHead(200, type ? { 'content-type': type } : {}).end(corps);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise(ok => serveur.listen(port, '127.0.0.1', () => ok(serveur)));
}

if (estLance(import.meta.url)) {
  const port = Number(process.env.PORT ?? 5299);
  await servir(port);
  console.log('http://localhost:' + port + '/pdf.html');
}
