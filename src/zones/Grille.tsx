// La grille des vignettes (ADR-0003) : on y voit le document entier, on y choisit, range et coupe. Elle se zoome
// par paliers (Ctrl+molette, pincement, + et -, ou le curseur de la barre) ; un double clic ou Entree ouvre la
// page en grand. Les pages se rangent en les glissant, ou au clavier par Alt+fleches ; un PDF depose sur la grille
// s'insere la ou on le lache. Une seule tabulation entre dans la grille : les fleches y deplacent le focus
// (aria-activedescendant), Tab en ressort.

import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { deplacementClavier, restreindre, toucher, toutOuRien } from '../engine/selection.js';
import { largeurVignette, palierVoisin } from '../engine/zoom.js';
import { pageSource, tailleVue } from '../model/montage.js';
import type { Atelier } from './atelier.js';
import Vignette from './Vignette.js';

/** Le nombre de colonnes de la grille, lu sur la mise en page : les vignettes qui partagent la ligne de la premiere. */
function colonnesDe(liste: HTMLElement | null): number {
  const items = liste ? [...liste.querySelectorAll<HTMLElement>('.vignette')] : [];
  const haut = items[0]?.offsetTop;
  return Math.max(1, items.filter(el => el.offsetTop === haut).length);
}

/** La position d'insertion sous le pointeur : avant la vignette survolee, ou apres si le pointeur en passe le milieu. */
function insertionSous(e: DragEvent, total: number): number {
  const cible = (e.target as HTMLElement).closest<HTMLElement>('.vignette');
  if (cible === null) return total;
  const position = Number(cible.dataset['position'] ?? total);
  const r = cible.getBoundingClientRect();
  return e.clientX > r.left + r.width / 2 ? position + 1 : position;
}

const TYPE_PAGES = 'application/x-pdf-pages';

export function Grille({ atelier, ouvrir }: { atelier: Atelier; ouvrir: (id: string) => void }) {
  const { montage, selection, setSelection, palier, setPalier } = atelier;
  const liste = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [insertion, setInsertion] = useState<number | null>(null);
  const ordre = montage.pages.map(p => p.id);
  const cote = largeurVignette(palier);

  useEffect(() => { setSelection(s => restreindre(s, montage.pages.map(p => p.id))); }, [montage, setSelection]);
  useEffect(() => { setActive(a => Math.min(a, Math.max(0, montage.pages.length - 1))); }, [montage.pages.length]);

  // Ctrl+molette zoome la grille, pas la page : l'ecouteur doit etre non passif pour retenir le zoom du navigateur.
  useEffect(() => {
    const el = liste.current;
    if (el === null) return;
    const molette = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) >= 1) setPalier(p => palierVoisin(p, e.deltaY < 0 ? 1 : -1));
    };
    el.addEventListener('wheel', molette, { passive: false });
    return () => el.removeEventListener('wheel', molette);
  }, [setPalier]);

  const cliquer = useCallback((e: MouseEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.vignette')?.dataset['id'];
    if (id === undefined) return;
    setSelection(s => toucher(s, ordre, id, { etendre: e.shiftKey, basculer: e.ctrlKey || e.metaKey }));
    setActive(ordre.indexOf(id));
  }, [ordre, setSelection]);

  const clavier = (e: KeyboardEvent) => {
    const total = ordre.length;
    const courant = ordre[active];
    const choisies = selection.ids.size > 0 ? selection.ids : new Set(courant === undefined ? [] : [courant]);
    const fleche = deplacementClavier(active, total, colonnesDe(liste.current), e.key);
    if (fleche !== null && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      // Alt+fleche range les pages choisies d'une case : on vise devant la voisine, ou apres elle.
      atelier.deplacer(choisies, e.key === 'ArrowLeft' ? Math.max(0, Math.min(...[...choisies].map(id => ordre.indexOf(id))) - 1)
        : Math.max(...[...choisies].map(id => ordre.indexOf(id))) + 2);
      setActive(fleche);
    } else if (fleche !== null) {
      setActive(fleche);
      const id = ordre[fleche];
      if (id !== undefined && e.shiftKey) setSelection(s => toucher(s, ordre, id, { etendre: true, basculer: false }));
      else if (id !== undefined && !e.ctrlKey && !e.metaKey) setSelection({ ids: new Set([id]), ancre: id });
    } else if (e.key === ' ' && courant !== undefined) {
      setSelection(s => toucher(s, ordre, courant, { etendre: e.shiftKey, basculer: true }));
    } else if (e.key === 'Enter' && courant !== undefined) {
      ouvrir(courant);
    } else if ((e.key === 'a' || e.key === 'A') && (e.ctrlKey || e.metaKey)) {
      setSelection(s => toutOuRien(s, ordre));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      atelier.retirer(choisies);
    } else if (e.key === 'r' || e.key === 'R') {
      atelier.pivoter(choisies, e.shiftKey ? -1 : 1);
    } else if (e.key === '+' || e.key === '=') {
      setPalier(p => palierVoisin(p, 1));
    } else if (e.key === '-') {
      setPalier(p => palierVoisin(p, -1));
    } else if (e.key === 'Escape' && selection.ids.size > 0) {
      setSelection({ ids: new Set(), ancre: null });
    } else {
      return;
    }
    e.preventDefault();
  };

  const commencerGlisser = (e: DragEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('.vignette')?.dataset['id'];
    if (id === undefined) return;
    // Glisser une page non choisie la deplace seule ; glisser une page choisie deplace toute la selection.
    if (!selection.ids.has(id)) setSelection({ ids: new Set([id]), ancre: id });
    e.dataTransfer.setData(TYPE_PAGES, selection.ids.has(id) ? [...selection.ids].join(' ') : id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const survoler = (e: DragEvent) => {
    const pages = e.dataTransfer.types.includes(TYPE_PAGES), fichiers = e.dataTransfer.types.includes('Files');
    if (!pages && !fichiers) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = pages ? 'move' : 'copy';
    setInsertion(insertionSous(e, ordre.length));
  };

  const deposer = (e: DragEvent) => {
    e.preventDefault();
    const position = insertionSous(e, ordre.length);
    setInsertion(null);
    const pages = e.dataTransfer.getData(TYPE_PAGES);
    if (pages !== '') atelier.deplacer(new Set(pages.split(' ')), position);
    else if (e.dataTransfer.files.length > 0) void atelier.ajouterFichiers([...e.dataTransfer.files], position);
  };

  const courante = ordre[active];
  return (
    <div ref={liste} className="grille" role="listbox" aria-multiselectable="true" aria-label="Pages du document"
      tabIndex={0} aria-activedescendant={courante === undefined ? undefined : 'vignette-' + courante}
      onClick={cliquer} onDoubleClick={e => { const id = (e.target as HTMLElement).closest<HTMLElement>('.vignette')?.dataset['id']; if (id) ouvrir(id); }}
      onKeyDown={clavier} onDragStart={commencerGlisser} onDragOver={survoler} onDragLeave={() => setInsertion(null)} onDrop={deposer}
      onDragEnd={() => setInsertion(null)} style={{ ['--cote' as string]: cote + 'px' }}>
      {montage.pages.map((p, i) => {
        const source = pageSource(montage, p);
        const nom = montage.sources.find(s => s.id === p.source)?.nom ?? '';
        return (
          <Vignette key={p.id} page={p} numero={i + 1} taille={source ? tailleVue(source, p) : { largeur: 1, hauteur: 1 }} nomSource={nom} cote={cote}
              choisie={selection.ids.has(p.id)} active={i === active} repere={insertion === i ? 'avant' : insertion === i + 1 && i === ordre.length - 1 ? 'apres' : null} />
        );
      })}
    </div>
  );
}
