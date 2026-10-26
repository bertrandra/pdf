// La roue d'attente, au milieu de l'ecran, pendant un travail long (lire, ecrire, convertir, reconnaitre) : elle dit
// ce qui se fait (« Reconnaissance du texte (OCR) : page 3 sur 12… ») et couvre la page, que l'on ne modifie pas en
// cours de route. Elle n'apparait qu'apres un court delai : un travail bref ne fait pas clignoter l'ecran. Son texte
// est cache aux lecteurs d'ecran : la region d'etat de la page dit deja la meme chose, une seule fois. Un travail qui
// peut s'arreter montre « Arreter », qui prend le focus (le reste de la page est inerte) ; Echap fait de meme.

import { useEffect, useRef, useState } from 'react';

/** Le delai avant d'afficher la roue : en dessous, un travail passe sans qu'on la voie. */
export const DELAI_ATTENTE = 300;

export function Attente({ travail, arreter }: { travail: string | null; arreter: (() => void) | null }) {
  const [visible, setVisible] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (travail === null) { setVisible(false); return; }
    const minuterie = setTimeout(() => setVisible(true), DELAI_ATTENTE);
    return () => clearTimeout(minuterie);
  }, [travail === null]);
  const montre = travail !== null && visible;
  useEffect(() => { if (montre && arreter !== null) bouton.current?.focus(); }, [montre, arreter !== null]);
  useEffect(() => {
    if (arreter === null || travail === null) return;
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); arreter(); } };
    addEventListener('keydown', touche);
    return () => removeEventListener('keydown', touche);
  }, [arreter, travail === null]);
  if (!montre) return null;
  return (
    <div className="attente">
      <div className="attente-carte">
        <div className="roue" aria-hidden="true" />
        <p className="attente-texte" aria-hidden="true">{travail}</p>
        {arreter !== null ? <button ref={bouton} type="button" onClick={arreter}>Arrêter</button> : null}
      </div>
    </div>
  );
}
