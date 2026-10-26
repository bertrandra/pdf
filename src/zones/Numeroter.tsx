// La boite de numerotation : ou poser le numero, comment l'ecrire, a partir de quel nombre, et si la couverture en
// porte un. Les numeros s'ecrivent a l'enregistrement, sur chaque fichier ecrit (chaque partie d'une scission
// recommence a son debut) ; on les retire comme on les pose, et « Annuler » les defait.

import { useEffect, useRef, useState } from 'react';
import { NUMEROTATION_DEFAUT, texteDuNumero } from '../engine/numerotation.js';
import type { FormatNumero, Numerotation, PositionNumero } from '../model/montage.js';

const POSITIONS: ReadonlyArray<readonly [PositionNumero, string]> = [
  ['haut-gauche', 'En haut à gauche'], ['haut-centre', 'En haut au centre'], ['haut-droite', 'En haut à droite'],
  ['bas-gauche', 'En bas à gauche'], ['bas-centre', 'En bas au centre'], ['bas-droite', 'En bas à droite']
];
const FORMATS: ReadonlyArray<readonly [FormatNumero, string]> = [['n', '3'], ['n-sur-total', '3 / 12'], ['page-n-sur-total', 'Page 3 sur 12']];

/** La phrase qui dit la numerotation en cours, pour la page et pour les lecteurs d'ecran. */
export function direNumerotation(n: Numerotation, total: number): string {
  const position = POSITIONS.find(p => p[0] === n.position)?.[1].toLowerCase() ?? '';
  return 'Pages numérotées ' + position + ', « ' + (texteDuNumero({ ...n, sauterPremiere: false }, 0, total) ?? '') + ' » pour la première'
    + (n.sauterPremiere ? ' (non écrit sur la couverture)' : '') + '.';
}

export function Numeroter({ actuelle, total, appliquer, fermer }: {
  actuelle: Numerotation | undefined; total: number; appliquer: (n: Numerotation | null) => void; fermer: () => void;
}) {
  const [n, setN] = useState<Numerotation>(actuelle ?? NUMEROTATION_DEFAUT);
  const [debut, setDebut] = useState(String(n.debut));
  const premier = useRef<HTMLSelectElement>(null);
  useEffect(() => { premier.current?.focus(); }, []);
  const debutLu = Number(debut);
  const valide = Number.isInteger(debutLu) && debutLu >= 0 && debutLu <= 99_999;
  const exemple = valide ? texteDuNumero({ ...n, debut: debutLu, sauterPremiere: false }, 0, total) : null;

  return (
    <div className="voile" onKeyDown={e => { if (e.key === 'Escape') fermer(); }}>
      <form className="boite" role="dialog" aria-modal="true" aria-labelledby="titre-numeros"
        onSubmit={e => { e.preventDefault(); if (valide) appliquer({ ...n, debut: debutLu }); }}>
        <h2 id="titre-numeros">Numéroter les pages</h2>
        <label className="champ">Position
          <select ref={premier} value={n.position} onChange={e => setN({ ...n, position: e.target.value as PositionNumero })}>
            {POSITIONS.map(([v, libelle]) => <option key={v} value={v}>{libelle}</option>)}
          </select>
        </label>
        <label className="champ">Format
          <select value={n.format} onChange={e => setN({ ...n, format: e.target.value as FormatNumero })}>
            {FORMATS.map(([v, libelle]) => <option key={v} value={v}>{libelle}</option>)}
          </select>
        </label>
        <label className="champ">Numéro de la première page
          <input type="number" min={0} max={99999} value={debut} onChange={e => setDebut(e.target.value)} aria-invalid={!valide} />
        </label>
        <label><input type="checkbox" checked={n.sauterPremiere} onChange={e => setN({ ...n, sauterPremiere: e.target.checked })} /> Ne rien écrire sur la première page (une couverture)</label>
        {!valide ? <p className="message echec" role="alert">Indiquez un nombre entier, de 0 à 99 999.</p> : null}
        <p className="discret-texte">
          {exemple !== null ? 'Première page : « ' + exemple + ' ». ' : ''}Les numéros s’écrivent dans le fichier enregistré, à l’endroit même sur une
          page tournée ; chaque fichier d’une scission recommence au premier numéro.
        </p>
        <div className="actions">
          <button type="button" onClick={fermer}>Annuler</button>
          {actuelle !== undefined ? <button type="button" className="destructif" onClick={() => appliquer(null)}>Retirer les numéros</button> : null}
          <button type="submit" className="primaire" disabled={!valide}>Numéroter</button>
        </div>
      </form>
    </div>
  );
}
