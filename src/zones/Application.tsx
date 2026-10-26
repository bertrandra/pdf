// La page entiere : la barre d'outils, la grille des pages (ou la zone de depot quand rien n'est ouvert), l'apercu
// en grand et la boite de scission. Une seule action pleine : « Enregistrer le PDF » ; les autres sont secondaires.
// Une seule region vocale (polite) dit ce qui vient de se passer.

import { useEffect, useRef, useState } from 'react';
import { idsAuxPositions } from '../engine/montage.js';
import { lirePlages } from '../engine/plages.js';
import { largeurVignette, palierVoisin, PALIERS_VIGNETTE } from '../engine/zoom.js';
import { useAtelier, nomDeSortie, type Atelier } from './atelier.js';
import { Apercu } from './Apercu.js';
import { Grille } from './Grille.js';
import { Attente } from './Attente.js';
import { Convertir } from './Convertir.js';
import { Scinder } from './Scinder.js';

function ChoisirPages({ atelier }: { atelier: Atelier }) {
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <form className="choisir" onSubmit={e => {
      e.preventDefault();
      const lu = lirePlages(texte, atelier.montage.pages.length);
      if ('erreur' in lu) { setErreur(lu.erreur); return; }
      setErreur(null);
      const ids = idsAuxPositions(atelier.montage, lu.positions);
      atelier.setSelection({ ids, ancre: atelier.montage.pages[lu.positions[0] ?? 0]?.id ?? null });
    }}>
      <label className="champ-ligne">Choisir les pages
        <input type="text" value={texte} size={10} placeholder="1-3, 7" onChange={e => setTexte(e.target.value)} aria-invalid={erreur !== null} title={erreur ?? undefined} />
      </label>
      <button type="submit">Choisir</button>
      {erreur !== null ? <span className="message echec" role="alert">{erreur}</span> : null}
    </form>
  );
}

function Zoom({ atelier }: { atelier: Atelier }) {
  const { palier, setPalier } = atelier;
  return (
    <div className="groupe zoom" role="group" aria-label="Taille des vignettes">
      <button type="button" onClick={() => setPalier(p => palierVoisin(p, -1))} disabled={palier <= 0} aria-label="Vignettes plus petites" title="Vignettes plus petites (−)">−</button>
      <input type="range" min={0} max={PALIERS_VIGNETTE.length - 1} step={1} value={palier} onChange={e => setPalier(Number(e.target.value))}
        aria-label="Taille des vignettes" aria-valuetext={largeurVignette(palier) + ' pixels'} />
      <button type="button" onClick={() => setPalier(p => palierVoisin(p, 1))} disabled={palier >= PALIERS_VIGNETTE.length - 1} aria-label="Vignettes plus grandes" title="Vignettes plus grandes (+)">+</button>
    </div>
  );
}

function Barre({ atelier, ajouter, scinder, convertir }: { atelier: Atelier; ajouter: () => void; scinder: () => void; convertir: () => void }) {
  const { montage, selection, occupe } = atelier;
  const vide = montage.pages.length === 0, aucune = selection.ids.size === 0;
  const n = selection.ids.size;
  return (
    <header className="barre" aria-label="Outils" inert={occupe}>
      <div className="groupe">
        <button type="button" onClick={ajouter}>Ajouter des PDF…</button>
        <button type="button" onClick={atelier.annuler} disabled={!atelier.peutAnnuler} title="Annuler (Ctrl+Z)">Annuler</button>
        <button type="button" onClick={atelier.retablir} disabled={!atelier.peutRetablir} title="Rétablir (Ctrl+Maj+Z)">Rétablir</button>
      </div>
      <div className="groupe" role="group" aria-label={aucune ? 'Pages choisies (aucune)' : n + ' page' + (n > 1 ? 's' : '') + ' choisie' + (n > 1 ? 's' : '')}>
        <button type="button" disabled={aucune} onClick={() => atelier.pivoter(selection.ids, -1)} title="Tourner à gauche (Maj+R)" aria-label="Tourner à gauche">↺</button>
        <button type="button" disabled={aucune} onClick={() => atelier.pivoter(selection.ids, 1)} title="Tourner à droite (R)" aria-label="Tourner à droite">↻</button>
        <button type="button" disabled={n < 2} onClick={() => atelier.inverser(selection.ids)}>Inverser l’ordre</button>
        <button type="button" disabled={aucune} onClick={() => atelier.garder(selection.ids)} title="Ne garder que les pages choisies">Découper</button>
        <button type="button" disabled={aucune} onClick={() => void atelier.enregistrer({ ...montage, pages: montage.pages.filter(p => selection.ids.has(p.id)) }, nomDeSortie(montage).replace(/\.pdf$/i, '') + '-extrait.pdf')}>Extraire…</button>
        <button type="button" className="destructif" disabled={aucune} onClick={() => atelier.retirer(selection.ids)} title="Supprimer (Suppr)">Supprimer</button>
      </div>
      {vide ? null : <ChoisirPages atelier={atelier} />}
      <div className="pousse" />
      {vide ? null : <Zoom atelier={atelier} />}
      <div className="groupe">
        <button type="button" disabled={vide || occupe} onClick={scinder}>Scinder…</button>
        <button type="button" disabled={vide || occupe} onClick={convertir} title="En PowerPoint ou en Word">Convertir…</button>
        <button type="button" className="primaire" disabled={vide || occupe} onClick={() => void atelier.enregistrer(montage, nomDeSortie(montage))}>Enregistrer le PDF</button>
      </div>
    </header>
  );
}

export function Application() {
  const atelier = useAtelier();
  const { montage, message } = atelier;
  const choix = useRef<HTMLInputElement>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [scission, setScission] = useState(false);
  const [conversion, setConversion] = useState(false);
  const [survol, setSurvol] = useState(false);

  // Ctrl+Z et Ctrl+Maj+Z (ou Ctrl+Y) partout, sauf dans un champ ou ils defont la saisie.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      // Pendant un travail, la page ne change pas : annuler ou retablir attendront qu'il soit fini.
      if (atelier.occupe || !(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).closest('input, textarea') !== null) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) atelier.retablir(); else atelier.annuler(); }
      else if (e.key.toLowerCase() === 'y') { e.preventDefault(); atelier.retablir(); }
    };
    addEventListener('keydown', touche);
    return () => removeEventListener('keydown', touche);
  }, [atelier.annuler, atelier.retablir, atelier.occupe]);

  useEffect(() => { if (apercu !== null && !montage.pages.some(p => p.id === apercu)) setApercu(null); }, [montage, apercu]);

  const fermerApercu = () => {
    setApercu(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.grille')?.focus());
  };

  return (
    <div className="application">
      <input ref={choix} type="file" accept="application/pdf,.pdf" multiple hidden
        onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; void atelier.ajouterFichiers(f); }} />
      <Barre atelier={atelier} ajouter={() => choix.current?.click()} scinder={() => setScission(true)} convertir={() => setConversion(true)} />
      <p className="etat" role="status" aria-live="polite">
        {message ? <span className={'message ' + message.type}>{message.texte}</span> : null}
        {atelier.travail !== null ? <span className="discret-texte"> {atelier.travail}</span> : null}
      </p>
      {montage.pages.length === 0 ? (
        <main className={'depot' + (survol ? ' survol' : '')} inert={atelier.occupe}
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setSurvol(true); } }}
          onDragLeave={() => setSurvol(false)}
          onDrop={e => { e.preventDefault(); setSurvol(false); void atelier.ajouterFichiers([...e.dataTransfer.files]); }}>
          <h1>Fusionner, découper, scinder des PDF</h1>
          <p>Déposez ici un ou plusieurs PDF : leurs pages se mettent à la suite, et vous les rangez, tournez, coupez avant d’enregistrer.</p>
          <p className="discret-texte">Rien ne quitte votre ordinateur : les fichiers sont lus et écrits dans cette page.</p>
          <button type="button" className="primaire" onClick={() => choix.current?.click()}>Choisir des PDF…</button>
        </main>
      ) : (
        <main className="travail" inert={atelier.occupe} aria-busy={atelier.occupe}>
          <Grille atelier={atelier} ouvrir={setApercu} />
          <p className="aide discret-texte">
            Clic, Maj+clic, Ctrl+clic pour choisir ; glisser ou Alt+flèches pour ranger ; double clic ou Entrée pour voir en grand ; Ctrl+molette pour zoomer.
            Déposez d’autres PDF sur la grille pour les insérer.
          </p>
        </main>
      )}
      <Attente travail={atelier.travail} />
      {apercu !== null ? <Apercu montage={montage} id={apercu} changer={setApercu} fermer={fermerApercu} /> : null}
      {scission ? <Scinder total={montage.pages.length} nom={nomDeSortie(montage)} fermer={() => setScission(false)}
        enregistrer={r => { setScission(false); void atelier.enregistrerScission(r); }} /> : null}
      {conversion ? <Convertir total={montage.pages.length} choisies={atelier.selection.ids.size} fermer={() => setConversion(false)}
        convertir={(format, seules, ocr) => { setConversion(false); void atelier.convertirEn(format, seules, ocr); }} /> : null}
    </div>
  );
}
