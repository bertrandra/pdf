// Le point d'entree de la page : tout est dans src/zones (React) et en dessous.
import { demarrer } from '../../src/zones/demarrer.js';

const conteneur = document.getElementById('application');
if (conteneur) demarrer(conteneur);
