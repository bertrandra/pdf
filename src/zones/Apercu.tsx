// L'apercu d'une page en grand (ADR-0003), par-dessus la grille : on y lit la page avant de la couper ou de la
// garder. Il se zoome en pourcentage (boutons, + et -, Ctrl+molette ou pincement, qui gardent sous le pointeur le
// point vise), ou s'ajuste a la page entiere ou a la pleine largeur, qui suivent la taille de la fenetre. Les
// fleches et Page precedente / suivante changent de page ; Echap ferme et rend le focus a la grille.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defilementAncre, echelleEffective, echelleVoisine, facteurMolette, pourcentage, type ZoomApercu } from '../engine/zoom.js';
import { dessinerPage } from '../io/apercu.js';
import { pageSource, tailleVue, type Montage } from '../model/montage.js';

/** Au-dela, un rendu couterait trop de memoire pour ce qu'il montre ; l'image s'agrandit alors sans plus de detail. */
const RENDU_MAX = 4096;

export function Apercu({ montage, id, changer, fermer }: { montage: Montage; id: string; changer: (id: string) => void; fermer: () => void }) {
  const zone = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const fermerBouton = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState<ZoomApercu>({ mode: 'page' });
  const [place, setPlace] = useState({ largeur: 0, hauteur: 0 });
  const ancre = useRef<{ x: number; y: number; avant: number } | null>(null);
  const position = montage.pages.findIndex(p => p.id === id);
  const page = montage.pages[position];
  const source = page ? pageSource(montage, page) : undefined;
  const taille = page && source ? tailleVue(source, page) : { largeur: 595, hauteur: 842 };
  const echelle = echelleEffective(zoom, taille, place);
  const largeur = Math.round(taille.largeur * echelle), hauteur = Math.round(taille.hauteur * echelle);

  useEffect(() => { fermerBouton.current?.focus(); }, []);

  useLayoutEffect(() => {
    const el = zone.current;
    if (el === null) return;
    // La place laissee a la page : la zone, moins sa marge interieure, pour qu'une page « entiere » ne touche pas le bord.
    const mesurer = () => setPlace({ largeur: Math.max(0, el.clientWidth - 32), hauteur: Math.max(0, el.clientHeight - 32) });
    mesurer();
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(mesurer) : null;
    obs?.observe(el);
    return () => obs?.disconnect();
  }, []);

  useEffect(() => {
    if (!page) return;
    let vivant = true;
    const densite = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    // Un rendu leger d'abord (la vignette est sans doute deja faite), puis le net, pour que le zoom reponde tout de suite.
    const net = Math.min(RENDU_MAX, Math.ceil(largeur * densite / 64) * 64);
    for (const l of [Math.min(net, 400), net]) {
      dessinerPage(page.source, page.index, page.rotation, Math.max(64, l)).then(d => {
        const c = toile.current;
        if (!vivant || c === null || (l !== net && c.width >= net)) return;
        c.width = d.width; c.height = d.height;
        c.getContext('2d')?.drawImage(d, 0, 0);
      }).catch(() => undefined);
    }
    return () => { vivant = false; };
  }, [page, largeur]);

  // Apres un zoom a la molette, on remet sous le pointeur le point qu'il visait.
  useLayoutEffect(() => {
    const el = zone.current, a = ancre.current;
    if (el === null || a === null) return;
    ancre.current = null;
    el.scrollLeft = defilementAncre(el.scrollLeft, a.x, a.avant, echelle);
    el.scrollTop = defilementAncre(el.scrollTop, a.y, a.avant, echelle);
  }, [echelle]);

  useEffect(() => {
    const el = zone.current;
    if (el === null) return;
    const molette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      ancre.current = { x: e.clientX - r.left, y: e.clientY - r.top, avant: echelle };
      setZoom({ mode: 'libre', echelle: echelle * facteurMolette(e.deltaY) });
    };
    el.addEventListener('wheel', molette, { passive: false });
    return () => el.removeEventListener('wheel', molette);
  }, [echelle]);

  const aller = (sens: 1 | -1) => { const p = montage.pages[position + sens]; if (p) changer(p.id); };
  const pas = (sens: 1 | -1) => setZoom({ mode: 'libre', echelle: echelleVoisine(echelle, sens) });
  const clavier = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === 'Escape') fermer();
    else if (k === '+' || k === '=') pas(1);
    else if (k === '-') pas(-1);
    else if (k === '0') setZoom({ mode: 'page' });
    else if (k === 'PageDown' || (k === 'ArrowRight' && !e.altKey)) aller(1);
    else if (k === 'PageUp' || (k === 'ArrowLeft' && !e.altKey)) aller(-1);
    else return;
    e.preventDefault();
  };

  if (!page) return null;
  const nom = montage.sources.find(s => s.id === page.source)?.nom ?? '';
  return (
    <div className="apercu-voile" onKeyDown={clavier}>
      <div className="apercu" role="dialog" aria-modal="true" aria-label={'Page ' + (position + 1) + ' sur ' + montage.pages.length}>
        <div className="apercu-barre">
          <span className="apercu-titre">Page {position + 1} sur {montage.pages.length} <span className="discret-texte">— {nom}, page {page.index + 1}</span></span>
          <div className="groupe" role="group" aria-label="Page">
            <button type="button" onClick={() => aller(-1)} disabled={position <= 0} aria-label="Page précédente">‹</button>
            <button type="button" onClick={() => aller(1)} disabled={position >= montage.pages.length - 1} aria-label="Page suivante">›</button>
          </div>
          <div className="groupe" role="group" aria-label="Zoom">
            <button type="button" onClick={() => pas(-1)} aria-label="Réduire">−</button>
            <output className="pourcentage" aria-live="polite">{pourcentage(echelle)}</output>
            <button type="button" onClick={() => pas(1)} aria-label="Agrandir">+</button>
            <button type="button" aria-pressed={zoom.mode === 'page'} onClick={() => setZoom({ mode: 'page' })}>Page entière</button>
            <button type="button" aria-pressed={zoom.mode === 'largeur'} onClick={() => setZoom({ mode: 'largeur' })}>Pleine largeur</button>
            <button type="button" aria-pressed={zoom.mode === 'libre' && Math.abs(echelle - 1) < 1e-3} onClick={() => setZoom({ mode: 'libre', echelle: 1 })}>100 %</button>
          </div>
          <button ref={fermerBouton} type="button" onClick={fermer}>Fermer</button>
        </div>
        <div ref={zone} className="apercu-zone" tabIndex={-1}>
          <canvas ref={toile} className="feuille apercu-page" style={{ width: largeur, height: hauteur }} role="img" aria-label={'Aperçu de la page ' + (position + 1)} />
        </div>
      </div>
    </div>
  );
}
