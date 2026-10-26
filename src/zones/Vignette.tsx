// Une page de la grille : son apercu, dessine quand elle approche de la vue et redessine seulement quand le zoom
// franchit un palier de rendu (engine/zoom.ts). Avant son dessin, la page est une feuille blanche a sa forme : la
// grille garde sa mise en page pendant que les apercus arrivent.

import { memo, useEffect, useRef, useState } from 'react';
import { cadreVignette, largeurDeRendu } from '../engine/zoom.js';
import { dessinerPage } from '../io/apercu.js';
import type { PageMontee } from '../model/montage.js';

export interface ProprietesVignette {
  readonly page: PageMontee;
  readonly numero: number;
  /** La taille vue de la page, rotation comprise, en points. */
  readonly taille: { largeur: number; hauteur: number };
  readonly nomSource: string;
  readonly cote: number;
  readonly choisie: boolean;
  readonly active: boolean;
  readonly repere: 'avant' | 'apres' | null;
}

function Vignette({ page, numero, taille, nomSource, cote, choisie, active, repere }: ProprietesVignette) {
  const toile = useRef<HTMLCanvasElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [echec, setEchec] = useState(false);
  const cadre = cadreVignette(taille.largeur, taille.hauteur, cote);
  const rendu = largeurDeRendu(cadre.largeur, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);

  useEffect(() => {
    const el = boite.current;
    if (el === null || typeof IntersectionObserver !== 'function') { setVisible(true); return; }
    // Une marge d'un ecran : les vignettes qu'on va voir en defilant sont pretes quand elles arrivent.
    const obs = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) setVisible(true); }, { rootMargin: '100% 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let vivant = true;
    dessinerPage(page.source, page.index, page.rotation, rendu).then(dessin => {
      const cible = toile.current;
      if (!vivant || cible === null) return;
      cible.width = dessin.width;
      cible.height = dessin.height;
      cible.getContext('2d')?.drawImage(dessin, 0, 0);
      setEchec(false);
    }).catch(() => { if (vivant) setEchec(true); });
    return () => { vivant = false; };
  }, [visible, page.source, page.index, page.rotation, rendu]);

  const classes = ['vignette', choisie ? 'choisie' : '', active ? 'active' : '', repere ? 'repere-' + repere : ''].filter(Boolean).join(' ');
  return (
    <div ref={boite} className={classes} role="option" aria-selected={choisie} id={'vignette-' + page.id} data-id={page.id} data-position={numero - 1}
      title={nomSource + ', page ' + (page.index + 1)} draggable>
      <div className="feuille-cadre" style={{ width: cote, height: cote }}>
        <canvas ref={toile} className="feuille" style={{ width: cadre.largeur, height: cadre.hauteur }} aria-hidden="true" />
        {echec ? <span className="feuille-echec">Aperçu indisponible</span> : null}
      </div>
      <span className="numero">{numero}{page.rotation !== 0 ? <span className="tour" aria-label={', tournée de ' + page.rotation + '°'}> ↻{page.rotation}°</span> : null}</span>
    </div>
  );
}

export default memo(Vignette);
