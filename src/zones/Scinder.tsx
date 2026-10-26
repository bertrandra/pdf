// La boite de scission : couper le document en plusieurs fichiers, toutes les n pages, avant des pages choisies,
// ou en parties ecrites a la main. Elle montre ce qui sortira (combien de fichiers, leurs noms et leurs pages)
// avant qu'on l'enregistre ; une ecriture fautive le dit sous son champ, et l'action reste grisee.

import { useEffect, useId, useRef, useState } from 'react';
import { nomsDesParties, partiesDeScission, type RegleScission } from '../engine/montage.js';
import { ecrirePlages, lireGroupes, lirePlages } from '../engine/plages.js';

type Mode = 'chaque' | 'avant' | 'groupes';

/** La regle que les champs decrivent, ou le refus qui dit ce qui ne va pas. */
function regleDe(mode: Mode, n: string, avant: string, groupes: string, total: number): RegleScission | { erreur: string } {
  if (mode === 'chaque') {
    const k = Number(n);
    return Number.isInteger(k) && k >= 1 ? { type: 'chaque', n: k } : { erreur: 'Indiquez un nombre entier de pages, au moins 1.' };
  }
  if (mode === 'avant') {
    const lu = lirePlages(avant, total);
    return 'erreur' in lu ? lu : { type: 'avant', positions: lu.positions };
  }
  const lu = lireGroupes(groupes, total);
  return 'erreur' in lu ? lu : { type: 'groupes', groupes: lu.groupes };
}

export function Scinder({ total, nom, enregistrer, fermer }: { total: number; nom: string; enregistrer: (r: RegleScission) => void; fermer: () => void }) {
  const [mode, setMode] = useState<Mode>('chaque');
  const [n, setN] = useState('1');
  const [avant, setAvant] = useState('');
  const [groupes, setGroupes] = useState('');
  const premier = useRef<HTMLInputElement>(null);
  const idErreur = useId();
  useEffect(() => { premier.current?.focus(); }, []);

  const regle = regleDe(mode, n, avant, groupes, total);
  const parties = 'erreur' in regle ? [] : partiesDeScission(total, regle);
  const noms = nomsDesParties(nom, parties.length);
  const erreur = 'erreur' in regle ? regle.erreur : null;

  const option = (m: Mode, libelle: string, champ: React.ReactNode) => (
    <div className="option-scission">
      <label><input ref={m === 'chaque' ? premier : undefined} type="radio" name="mode-scission" checked={mode === m} onChange={() => setMode(m)} /> {libelle}</label>
      {mode === m ? champ : null}
    </div>
  );

  return (
    <div className="voile" onKeyDown={e => { if (e.key === 'Escape') fermer(); }}>
      <form className="boite" role="dialog" aria-modal="true" aria-labelledby="titre-scission"
        onSubmit={e => { e.preventDefault(); if (!('erreur' in regle)) enregistrer(regle); }}>
        <h2 id="titre-scission">Scinder en plusieurs fichiers</h2>
        <fieldset>
          <legend className="discret-texte">Comment couper les {total} pages ?</legend>
          {option('chaque', 'Toutes les n pages', <label className="champ">Pages par fichier
            <input type="number" min={1} max={total} value={n} onChange={e => setN(e.target.value)} aria-describedby={erreur ? idErreur : undefined} /></label>)}
          {option('avant', 'Avant certaines pages', <label className="champ">Commencer un fichier aux pages
            <input type="text" value={avant} placeholder="par exemple 4, 9" onChange={e => setAvant(e.target.value)} aria-describedby={erreur ? idErreur : undefined} /></label>)}
          {option('groupes', 'En parties choisies', <label className="champ">Une partie par ligne, ou séparées par « / »
            <textarea rows={3} value={groupes} placeholder={'1-3\n4-8, 12\n9-11'} onChange={e => setGroupes(e.target.value)} aria-describedby={erreur ? idErreur : undefined} /></label>)}
        </fieldset>
        {erreur !== null && (mode === 'chaque' || (mode === 'avant' ? avant : groupes).trim() !== '')
          ? <p id={idErreur} className="message echec" role="alert">{erreur}</p> : null}
        {parties.length > 0 ? (
          <div className="resume">
            <p>{parties.length === 1 ? 'Un fichier PDF' : parties.length + ' fichiers, dans une archive ZIP'} :</p>
            <ol className="liste-parties">
              {parties.slice(0, 50).map((p, k) => <li key={k}><code>{noms[k]}</code> — {p.length > 1 ? 'pages' : 'page'} {ecrirePlages(p)}</li>)}
              {parties.length > 50 ? <li>… et {parties.length - 50} de plus</li> : null}
            </ol>
          </div>
        ) : null}
        <div className="actions">
          <button type="button" onClick={fermer}>Annuler</button>
          <button type="submit" className="primaire" disabled={parties.length === 0}>
            {parties.length > 1 ? 'Enregistrer les ' + parties.length + ' fichiers' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
