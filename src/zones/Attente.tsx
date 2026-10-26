// La roue d'attente, au milieu de l'ecran, pendant un travail long (lire, ecrire, convertir, reconnaitre) : elle dit
// ce qui se fait (« Reconnaissance du texte (OCR) : page 3 sur 12… ») et couvre la page, que l'on ne modifie pas en
// cours de route. Elle n'apparait qu'apres un court delai : un travail bref ne fait pas clignoter l'ecran. Elle est
// cachee aux lecteurs d'ecran : la region d'etat de la page dit deja la meme chose, une seule fois.

import { useEffect, useState } from 'react';

/** Le delai avant d'afficher la roue : en dessous, un travail passe sans qu'on la voie. */
export const DELAI_ATTENTE = 300;

export function Attente({ travail }: { travail: string | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (travail === null) { setVisible(false); return; }
    const minuterie = setTimeout(() => setVisible(true), DELAI_ATTENTE);
    return () => clearTimeout(minuterie);
  }, [travail === null]);
  if (travail === null || !visible) return null;
  return (
    <div className="attente" aria-hidden="true">
      <div className="attente-carte">
        <div className="roue" />
        <p className="attente-texte">{travail}</p>
      </div>
    </div>
  );
}
