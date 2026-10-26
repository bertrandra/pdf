// La boite de conversion : PowerPoint ou Word, et pour Word la facon (fidele ou texte modifiable). Chaque choix
// dit ce qu'il garde et ce qu'il perd, avant qu'on le lance : une conversion n'est jamais sans perte.

import { useEffect, useRef, useState } from 'react';
import type { FormatConversion } from '../io/conversion.js';

const CHOIX: ReadonlyArray<{ format: FormatConversion; titre: string; detail: string }> = [
  { format: 'pptx', titre: 'PowerPoint (.pptx)', detail: 'Une diapositive par page : le texte reste modifiable, chaque ligne à sa place, sur le fond de la page.' },
  { format: 'docx-fidele', titre: 'Word, mise en page conservée (.docx)', detail: 'Une page Word par page, à la même taille : le texte reste modifiable, chaque ligne à sa place, sur le fond de la page.' },
  { format: 'docx-texte', titre: 'Word, texte au fil (.docx)', detail: 'Le texte en paragraphes qui se suivent, facile à réécrire ; la mise en page, les images et les tableaux sont perdus.' }
];

export function Convertir({ total, choisies, convertir, fermer }: {
  total: number; choisies: number; convertir: (format: FormatConversion, seulementChoisies: boolean) => void; fermer: () => void;
}) {
  const [format, setFormat] = useState<FormatConversion>('pptx');
  const [seulementChoisies, setSeulementChoisies] = useState(false);
  const premier = useRef<HTMLInputElement>(null);
  useEffect(() => { premier.current?.focus(); }, []);
  const n = seulementChoisies ? choisies : total;

  return (
    <div className="voile" onKeyDown={e => { if (e.key === 'Escape') fermer(); }}>
      <form className="boite" role="dialog" aria-modal="true" aria-labelledby="titre-conversion"
        onSubmit={e => { e.preventDefault(); convertir(format, seulementChoisies); }}>
        <h2 id="titre-conversion">Convertir en PowerPoint ou en Word</h2>
        <fieldset>
          <legend className="discret-texte">Format</legend>
          {CHOIX.map((c, i) => (
            <label key={c.format} className="choix-format">
              <input ref={i === 0 ? premier : undefined} type="radio" name="format-conversion" checked={format === c.format} onChange={() => setFormat(c.format)} />
              <span><strong>{c.titre}</strong><br /><span className="discret-texte">{c.detail}</span></span>
            </label>
          ))}
        </fieldset>
        {choisies > 0 ? (
          <fieldset>
            <legend className="discret-texte">Pages</legend>
            <label><input type="radio" name="pages-conversion" checked={!seulementChoisies} onChange={() => setSeulementChoisies(false)} /> Tout le document ({total} pages)</label>
            <label><input type="radio" name="pages-conversion" checked={seulementChoisies} onChange={() => setSeulementChoisies(true)} /> Les pages choisies ({choisies})</label>
          </fieldset>
        ) : null}
        <p className="discret-texte">Le texte garde sa police si elle est installée sur l’ordinateur qui ouvre le fichier, une police proche sinon.
          Une page scannée n’a pas de texte : elle reste une image.</p>
        <p className="discret-texte">La conversion se fait dans cette page : rien n’est envoyé. Comptez quelques secondes par dizaine de pages.</p>
        <div className="actions">
          <button type="button" onClick={fermer}>Annuler</button>
          <button type="submit" className="primaire" disabled={n === 0}>Convertir {n > 1 ? 'les ' + n + ' pages' : 'la page'}</button>
        </div>
      </form>
    </div>
  );
}
