// Monte l'application dans un conteneur de la page.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Application } from './Application.js';

export function demarrer(conteneur: HTMLElement): void {
  createRoot(conteneur).render(<StrictMode><Application /></StrictMode>);
}
