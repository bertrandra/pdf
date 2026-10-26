// Lire les fichiers choisis ou deposes, et remettre un fichier a la personne. Le seul endroit ou les octets
// entrent dans la page et en sortent : le moteur ne voit que des Uint8Array.

/** Les octets d'un fichier choisi ou depose. */
export async function lireFichier(f: Blob): Promise<Uint8Array> {
  return new Uint8Array(await f.arrayBuffer());
}

/** Ce qu'il est advenu d'un fichier propose : enregistre, ou refuse par la personne (elle a dit non a la confirmation). */
export type Remise = 'enregistre' | 'refuse';

/** Le service d'enregistrement d'une page publiee sur claude.ai (capacite `downloads`), quand la page y est servie. */
interface Enregistreur { save(r: { filename: string; data: Blob }): Promise<unknown> }
interface HoteClaude { use(nom: 'downloads'): Promise<Enregistreur | null> }

/**
 * L'enregistreur de l'hote, s'il y en a un. Une page publiee comme artefact ne peut pas lancer un telechargement
 * elle-meme : l'hote le propose a la personne, qui confirme. Ailleurs (la page servie seule, un hote integrateur),
 * `window.claude` n'existe pas et l'on rend null.
 */
function enregistreur(): Promise<Enregistreur | null> {
  const hote = (window as unknown as { claude?: HoteClaude }).claude;
  if (hote === undefined || typeof hote.use !== 'function') return Promise.resolve(null);
  return hote.use('downloads').catch(() => null);
}

/** Les refus de l'hote qu'on dit a la personne tels quels ; les autres veulent dire « pas ici ». */
const MESSAGES: Record<string, string> = {
  too_large: 'Le fichier est trop gros pour être enregistré ici.',
  rate_limited: 'Un enregistrement attend déjà votre réponse : répondez-y, puis recommencez.',
  rejected_extension: 'Ce type de fichier ne peut pas être enregistré ici.',
  extension_not_enabled: 'Ce type de fichier ne peut pas être enregistré ici.'
};

/**
 * Remet `octets` a la personne sous le nom `nom`. Rien ne part sur le reseau. Dans un artefact, l'hote demande
 * confirmation (« refuse » si elle dit non) ; ailleurs, un lien vers un Blob local est clique. Leve une Error au
 * message lisible quand l'enregistrement est impossible.
 */
export async function telecharger(octets: Uint8Array, nom: string, type: string): Promise<Remise> {
  const blob = new Blob([octets.slice().buffer], { type });
  const hote = await enregistreur();
  if (hote !== null) {
    try {
      await hote.save({ filename: nom, data: blob });
      return 'enregistre';
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
      if (code === 'declined') return 'refuse';
      throw new Error(MESSAGES[code] ?? 'L’enregistrement n’est pas possible dans cette vue.');
    }
  }
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.rel = 'noopener';
  document.body.append(lien);
  lien.click();
  lien.remove();
  // Le navigateur a pris le lien au clic ; on rend la memoire un peu apres, pas tout de suite (Safari).
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'enregistre';
}
