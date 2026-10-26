// Lire les fichiers choisis ou deposes, et remettre un fichier a la personne. Le seul endroit ou les octets
// entrent dans la page et en sortent : le moteur ne voit que des Uint8Array.

/** Les octets d'un fichier choisi ou depose. */
export async function lireFichier(f: Blob): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer());
}

/** Propose `octets` au telechargement sous le nom `nom`. Rien ne part sur le reseau : un lien vers un Blob local. */
export function telecharger(octets: Uint8Array, nom: string, type: string): void {
  const url = URL.createObjectURL(new Blob([octets.slice().buffer], { type }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.rel = 'noopener';
  document.body.append(lien);
  lien.click();
  lien.remove();
  // Le navigateur a pris le lien au clic ; on rend la memoire un peu apres, pas tout de suite (Safari).
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
