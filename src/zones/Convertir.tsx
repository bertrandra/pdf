// La boite de conversion : PowerPoint, Word (mise en page conservee ou texte au fil), PDF cherchable ou images.
// Chaque choix dit ce qu'il garde et ce qu'il perd, avant qu'on le lance : une conversion n'est jamais sans perte.

import { useEffect, useRef, useState } from 'react';
import type { FormatConversion } from '../io/conversion.js';
import { LANGUES_OCR, NOMS_LANGUES, type LangueOcr } from '../io/ocr.js';

/** Ou la page se souvient des langues choisies, pour cette personne, sur cet ordinateur : une commodite, rien de plus. */
const CLE_LANGUES = 'pdf.langues-ocr';

function languesRetenues(): LangueOcr[] {
  try {
    const lu = JSON.parse(localStorage.getItem(CLE_LANGUES) ?? 'null') as unknown;
    const langues = Array.isArray(lu) ? LANGUES_OCR.filter(l => lu.includes(l)) : [];
    return langues.length > 0 ? langues : [...LANGUES_OCR];
  } catch {
    return [...LANGUES_OCR];
  }
}

function retenirLangues(langues: readonly LangueOcr[]): void {
  try { localStorage.setItem(CLE_LANGUES, JSON.stringify(langues)); } catch { /* stockage indisponible : rien a retenir */ }
}

const CHOIX: ReadonlyArray<{ format: FormatConversion; titre: string; detail: string }> = [
  { format: 'pptx', titre: 'PowerPoint (.pptx)', detail: 'Une diapositive par page : le texte reste modifiable, chaque ligne à sa place, sur le fond de la page.' },
  { format: 'docx-fidele', titre: 'Word, mise en page conservée (.docx)', detail: 'Une page Word par page, à la même taille : le texte reste modifiable, chaque ligne à sa place, sur le fond de la page.' },
  { format: 'docx-texte', titre: 'Word, texte au fil (.docx)', detail: 'Le texte en paragraphes qui se suivent, facile à réécrire ; la mise en page, les images et les tableaux sont perdus.' },
  { format: 'pdf-cherchable', titre: 'PDF cherchable (.pdf)', detail: 'Le même PDF, à l’identique : chaque page scannée reçoit, sous son image, le texte qu’on y lit, pour chercher et copier.' },
  { format: 'images', titre: 'Images PNG (.png ou .zip)', detail: 'Une image par page, à 150 dpi ; le texte n’est plus que des pixels. Plusieurs pages partent dans une archive ZIP.' }
];

export function Convertir({ total, choisies, convertir, fermer }: {
  total: number; choisies: number; convertir: (format: FormatConversion, seulementChoisies: boolean, langues: readonly LangueOcr[] | null) => void; fermer: () => void;
}) {
  const [format, setFormat] = useState<FormatConversion>('pptx');
  const [seulementChoisies, setSeulementChoisies] = useState(false);
  const [ocr, setOcr] = useState(true);
  const [langues, setLangues] = useState<LangueOcr[]>(languesRetenues);
  const reconnait = format === 'pdf-cherchable' || (format !== 'images' && ocr);
  const premier = useRef<HTMLInputElement>(null);
  useEffect(() => { premier.current?.focus(); }, []);
  const n = seulementChoisies ? choisies : total;
  const sansLangue = reconnait && langues.length === 0;
  const basculer = (l: LangueOcr, oui: boolean) => setLangues(ls => LANGUES_OCR.filter(x => (x === l ? oui : ls.includes(x))));

  return (
    <div className="voile" onKeyDown={e => { if (e.key === 'Escape') fermer(); }}>
      <form className="boite" role="dialog" aria-modal="true" aria-labelledby="titre-conversion"
        onSubmit={e => {
          e.preventDefault();
          if (sansLangue) return;
          if (reconnait) retenirLangues(langues);
          convertir(format, seulementChoisies, reconnait ? langues : null);
        }}>
        <h2 id="titre-conversion">Convertir</h2>
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
        {format === 'images' ? null : format === 'pdf-cherchable' ? (
          <p className="discret-texte">Le texte des pages scannées est reconnu sur l’ordinateur (OCR), avec le modèle le plus précis :
            comptez quelques secondes par page scannée. Une page qui a déjà du texte ne change pas.</p>
        ) : <label className="choix-format">
          <input type="checkbox" checked={ocr} onChange={e => setOcr(e.target.checked)} aria-describedby="aide-ocr" />
          <span><strong>Reconnaître le texte des pages scannées (OCR)</strong><br />
            <span id="aide-ocr" className="discret-texte">Une page scannée devient du texte modifiable, avec le modèle le plus précis.
              Comptez quelques secondes par page scannée ; sans cela, elle reste une image.</span></span>
        </label>}
        {reconnait ? (
          <fieldset>
            <legend className="discret-texte">Langues des pages scannées</legend>
            {LANGUES_OCR.map(l => (
              <label key={l}><input type="checkbox" checked={langues.includes(l)} onChange={e => basculer(l, e.target.checked)} /> {NOMS_LANGUES[l]}</label>
            ))}
            <p className="discret-texte">Une seule langue se charge et se lit plus vite ; une page tournée de côté ou à l’envers est remise dans son sens.</p>
            {sansLangue ? <p className="message echec" role="alert">Choisissez au moins une langue.</p> : null}
          </fieldset>
        ) : null}
        {format === 'pptx' || format === 'docx-fidele'
          ? <p className="discret-texte">Le texte garde sa police si elle est installée sur l’ordinateur qui ouvre le fichier, une police proche sinon.</p> : null}
        <p className="discret-texte">La conversion se fait dans cette page : rien n’est envoyé. Comptez quelques secondes par dizaine de pages.</p>
        <div className="actions">
          <button type="button" onClick={fermer}>Annuler</button>
          <button type="submit" className="primaire" disabled={n === 0 || sansLangue}>Convertir {n > 1 ? 'les ' + n + ' pages' : 'la page'}</button>
        </div>
      </form>
    </div>
  );
}
