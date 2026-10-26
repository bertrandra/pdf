// L'etat de la page et ses verbes : le montage et son historique, la selection, les octets des sources, et les
// gestes qui les changent. Les composants ne font que lire cet etat et appeler ces verbes ; le calcul est dans
// engine/, l'ecriture dans export/, les fichiers et pdf.js dans io/.
//
// Un travail long (lire, ecrire, scinder, convertir) occupe la page : la roue d'attente le dit, et la page ne change
// pas pendant ce temps. Ecrire une scission ou convertir peut s'arreter (« Arreter » sur la roue, ou Echap).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ajouterSource, deplacerPages, dupliquerPages, garderPages, integrerFichiers, inverserPages, nomsDesParties, numeroter, pivoterPages,
  retirerPages, scinder, type FichierLu, type RegleScission
} from '../engine/montage.js';
import { SELECTION_VIDE, type Selection } from '../engine/selection.js';
import { PALIER_DEFAUT } from '../engine/zoom.js';
import { assembler, assemblerPrepare, preparer } from '../export/assemblage.js';
import { pdfBlanc } from '../export/pageBlanche.js';
import { ecrireZip } from '../export/zip.js';
import { declarerSource, oublierSource, protectionDe } from '../io/apercu.js';
import { convertir, type FormatConversion } from '../io/conversion.js';
import { lireFichier, telecharger } from '../io/fichiers.js';
import { fichierPdf, lirePdf } from '../io/lecture.js';
import { MONTAGE_VIDE, pageSource, tailleVue, type Montage, type Numerotation } from '../model/montage.js';
import { annuler as annulerH, avancer, historique, retablir as retablirH, type Historique } from '../util/historique.js';

export type Message = { readonly type: 'info' | 'alerte' | 'echec'; readonly texte: string };

/** Le nom du fichier enregistre : celui du premier PDF ouvert (une page blanche ne compte pas), ou « document.pdf ». */
export const nomDeSortie = (m: Montage): string => (m.sources.find(s => s.vierge !== true)?.nom.replace(/\.pdf$/i, '') || 'document') + '.pdf';

/** Les sources que l'historique peut encore remonter : les octets des autres peuvent partir. */
export const sourcesUtiles = (h: Historique<Montage>): Set<string> =>
  new Set([h.present, ...h.passe, ...h.futur].flatMap(m => m.sources.map(s => s.id)));

/** Le refus d'un PDF protege, selon ce que pdf.js en dit : une protection du proprietaire n'est pas un mot de passe. */
export function refusProtege(protection: 'proprietaire' | 'mot-de-passe' | 'inconnue'): string {
  if (protection === 'proprietaire') {
    return 'ce PDF s’ouvre, mais son auteur en interdit la modification : retirez cette protection (dans le logiciel qui l’a produit), puis rouvrez-le.';
  }
  return 'ce PDF est protégé par un mot de passe : retirez la protection, puis rouvrez-le.';
}

/** Le message quand la personne a refuse l'enregistrement que l'hote lui proposait : un choix, pas un echec. */
const ANNULE: Message = { type: 'info', texte: 'Enregistrement annulé.' };

const raison = (e: unknown): string => (e instanceof Error ? e.message : 'Erreur inattendue.');

const pluriel = (n: number, mot: string): string => n + ' ' + mot + (n > 1 ? 's' : '');

/** Lit des fichiers PDF : chacun rend ses pages ou son refus nomme, et ses octets s'il a pu etre lu. */
async function lireLesPdf(fichiers: readonly File[]): Promise<{ lu: FichierLu; brut: Uint8Array | null }[]> {
  const lus: { lu: FichierLu; brut: Uint8Array | null }[] = [];
  for (const f of fichiers) {
    try {
      const brut = await lireFichier(f);
      const lu = await lirePdf(brut);
      if ('chiffre' in lu) lus.push({ lu: { nom: f.name, erreur: refusProtege(await protectionDe(brut)) }, brut });
      else lus.push({ lu: 'erreur' in lu ? { nom: f.name, erreur: lu.erreur } : { nom: f.name, pages: lu.pages }, brut });
    } catch (e) {
      lus.push({ lu: { nom: f.name, erreur: raison(e) }, brut: null });
    }
  }
  return lus;
}

/**
 * Ou inserer une page blanche, et a quelle taille : apres la derniere page choisie (au bout sans choix), de la taille
 * vue de la page qui la precede (une page blanche apres un paysage est un paysage), en A4 dans un montage vide.
 */
export function placeDePageBlanche(m: Montage, ids: ReadonlySet<string>): { position: number; t: { largeur: number; hauteur: number } } {
  const positions = m.pages.flatMap((p, i) => (ids.has(p.id) ? [i] : []));
  const position = positions.length > 0 ? Math.max(...positions) + 1 : m.pages.length;
  const voisine = m.pages[position - 1] ?? m.pages[0];
  const source = voisine === undefined ? undefined : pageSource(m, voisine);
  return { position, t: voisine !== undefined && source !== undefined ? tailleVue(source, voisine) : { largeur: 595.28, hauteur: 841.89 } };
}

/**
 * Un travail long : la roue d'attente dit son libelle, la page ne change pas, et un travail arretable recoit un
 * signal que « Arreter » declenche (`interrompre`).
 */
function useTravail() {
  /** Ce que la page est en train de faire (« Lecture des fichiers… »), ou null : la roue d'attente l'affiche. */
  const [travail, setTravail] = useState<string | null>(null);
  /** L'arret du travail en cours, s'il peut s'arreter. */
  const arret = useRef<AbortController | null>(null);
  const [arretable, setArretable] = useState(false);

  /** Mene `f` sous le libelle donne. Rend vrai si le travail a ete arrete ; une autre erreur remonte. */
  const mener = useCallback(async (libelle: string, arretableIci: boolean, f: (signal: AbortSignal) => Promise<void>): Promise<boolean> => {
    const controle = new AbortController();
    arret.current = arretableIci ? controle : null;
    setArretable(arretableIci);
    setTravail(libelle);
    try {
      await f(controle.signal);
      return false;
    } catch (e) {
      if (controle.signal.aborted) return true;
      throw e;
    } finally {
      arret.current = null;
      setArretable(false);
      setTravail(null);
    }
  }, []);

  const interrompre = useCallback(() => { arret.current?.abort(); }, []);
  return { travail, setTravail, arretable, mener, interrompre };
}

export function useAtelier() {
  const [h, setH] = useState<Historique<Montage>>(() => historique(MONTAGE_VIDE));
  const [selection, setSelection] = useState<Selection>(SELECTION_VIDE);
  const [palier, setPalier] = useState(PALIER_DEFAUT);
  const [message, setMessage] = useState<Message | null>(null);
  const { travail, setTravail, arretable, mener, interrompre } = useTravail();
  const octets = useRef(new Map<string, Uint8Array>());
  // Le dernier etat rendu, pour les gestes asynchrones : un ajout calcule ses identifiants sur le montage du moment.
  const dernier = useRef(h);
  dernier.current = h;
  const montage = h.present;

  const appliquer = useCallback((f: (m: Montage) => Montage, cle: string | null = null) => {
    setH(prec => avancer(prec, f(prec.present), cle));
  }, []);

  /** Pose un etat calcule hors de React (apres une lecture asynchrone), sans attendre le prochain rendu. */
  const poser = useCallback((m: Montage) => {
    const suivant = avancer(dernier.current, m);
    dernier.current = suivant;
    setH(suivant);
  }, []);

  const ajouterFichiers = useCallback(async (fichiers: readonly File[], avant?: number) => {
    const refusTypes = fichiers.filter(f => !fichierPdf(f)).map(f => '« ' + f.name + ' » n’est pas un PDF.');
    let lus: { lu: FichierLu; brut: Uint8Array | null }[] = [];
    await mener('Lecture des fichiers…', false, async () => { lus = await lireLesPdf(fichiers.filter(fichierPdf)); });
    const bruts = lus.map(l => l.brut);
    const r = integrerFichiers(dernier.current.present, lus.map(l => l.lu), avant);
    r.sources.forEach((id, k) => {
      const brut = bruts[k];
      if (id !== null && brut != null) { octets.current.set(id, brut); declarerSource(id, brut); }
    });
    poser(r.montage);
    const refus = [...refusTypes, ...r.refus];
    if (refus.length > 0) setMessage({ type: 'echec', texte: refus.join(' ') });
    else if (r.ajoutees > 0) setMessage({ type: 'info', texte: pluriel(r.ajoutees, 'page') + ' ajoutée' + (r.ajoutees > 1 ? 's' : '') + '.' });
  }, [mener, poser]);

  /** Insere une page blanche apres les pages choisies (au bout sans choix), de la taille de la page qui la precede. */
  const insererPageBlanche = useCallback(async (ids: ReadonlySet<string>) => {
    const m = dernier.current.present;
    const { position, t } = placeDePageBlanche(m, ids);
    const brut = await pdfBlanc(t.largeur, t.hauteur);
    const suivant = ajouterSource(m, 'Page blanche', [{ largeur: t.largeur, hauteur: t.hauteur, rotation: 0 }], position, true);
    const id = suivant.sources[suivant.sources.length - 1]?.id;
    if (id !== undefined) { octets.current.set(id, brut); declarerSource(id, brut); }
    poser(suivant);
    setMessage({ type: 'info', texte: 'Page blanche insérée en position ' + (position + 1) + '.' });
  }, [poser]);

  const verbes = useMemo(() => ({
    annuler: () => setH(annulerH),
    retablir: () => setH(retablirH),
    retirer: (ids: ReadonlySet<string>) => { appliquer(m => retirerPages(m, ids)); setSelection(SELECTION_VIDE); },
    garder: (ids: ReadonlySet<string>) => appliquer(m => garderPages(m, ids)),
    deplacer: (ids: ReadonlySet<string>, avant: number) => appliquer(m => deplacerPages(m, ids, avant)),
    pivoter: (ids: ReadonlySet<string>, sens: 1 | -1) => appliquer(m => pivoterPages(m, ids, sens)),
    inverser: (ids: ReadonlySet<string>) => appliquer(m => inverserPages(m, ids)),
    dupliquer: (ids: ReadonlySet<string>) => appliquer(m => dupliquerPages(m, ids)),
    numeroter: (n: Numerotation | null) => appliquer(m => numeroter(m, n)),
    vider: () => { appliquer(() => MONTAGE_VIDE); setSelection(SELECTION_VIDE); }
  }), [appliquer]);

  /** Ecrit un montage et le telecharge ; le message dit ce qui est parti, ou pourquoi rien n'est parti. */
  const enregistrer = useCallback(async (m: Montage, nom: string) => {
    try {
      await mener('Écriture du PDF…', false, async () => {
        const remise = await telecharger(await assembler(m, octets.current), nom, 'application/pdf');
        setMessage(remise === 'refuse' ? ANNULE : { type: 'info', texte: '« ' + nom + ' » enregistré (' + pluriel(m.pages.length, 'page') + ').' });
      });
    } catch (e) {
      setMessage({ type: 'echec', texte: raison(e) });
    }
  }, [mener]);

  /** Scinde le montage et telecharge les parties : une seule s'enregistre en PDF, plusieurs en une archive ZIP. */
  const enregistrerScission = useCallback(async (regle: RegleScission) => {
    const parties = scinder(montage, regle);
    const base = nomDeSortie(montage);
    const noms = nomsDesParties(base, parties.length);
    try {
      const arretee = await mener('Écriture des fichiers…', true, async signal => {
        // Les sources se chargent une fois pour toutes les parties : scinder trois cents pages une a une ne relit pas
        // trois cents fois le fichier.
        const preparees = await preparer(montage, octets.current);
        const fichiers = [];
        for (const [k, p] of parties.entries()) {
          signal.throwIfAborted();
          setTravail('Écriture des fichiers : ' + (k + 1) + ' sur ' + parties.length + '…');
          fichiers.push({ nom: noms[k] ?? 'partie.pdf', donnees: await assemblerPrepare(p, preparees) });
        }
        signal.throwIfAborted();
        const seul = fichiers[0];
        const remise = fichiers.length === 1 && seul !== undefined
          ? await telecharger(seul.donnees, seul.nom, 'application/pdf')
          : await telecharger(ecrireZip(fichiers), base.replace(/\.pdf$/i, '') + '.zip', 'application/zip');
        if (remise === 'refuse') setMessage(ANNULE);
        else setMessage({ type: 'info', texte: pluriel(fichiers.length, 'fichier') + ' enregistré' + (fichiers.length > 1 ? 's' : '') + '.' });
      });
      if (arretee) setMessage({ type: 'info', texte: 'Scission arrêtée : rien n’a été enregistré.' });
    } catch (e) {
      setMessage({ type: 'echec', texte: raison(e) });
    }
  }, [montage, mener]);

  /**
   * Convertit le montage entier, ou seulement les pages choisies. La barre d'etat dit l'avancee a chaque page ; la
   * conversion s'arrete a la page suivante quand on le demande.
   */
  const convertirEn = useCallback(async (format: FormatConversion, seulementChoisies: boolean, ocr: boolean) => {
    const m = seulementChoisies ? { ...montage, pages: montage.pages.filter(p => selection.ids.has(p.id)) } : montage;
    const racine = nomDeSortie(montage).replace(/\.pdf$/i, '');
    try {
      const arretee = await mener('Préparation de la conversion…', true, async signal => {
        const converti = await convertir(m, octets.current, format, ocr, (fait, total, reconnaissance) => {
          setTravail((reconnaissance ? 'Reconnaissance du texte (OCR) : page ' : 'Conversion : page ') + fait + ' sur ' + total + '…');
        }, signal);
        signal.throwIfAborted();
        // Un PDF cherchable ne doit pas ecraser l'original par megarde : il porte son propre nom.
        const nom = racine + (format === 'pdf-cherchable' ? '-cherchable' : format === 'images' ? '-pages' : '') + '.' + converti.extension;
        const remise = await telecharger(converti.octets, nom, converti.type);
        if (remise === 'refuse') setMessage(ANNULE);
        else setMessage({ type: 'info', texte: '« ' + nom + ' » enregistré (' + pluriel(m.pages.length, 'page') + ').' });
      });
      if (arretee) setMessage({ type: 'info', texte: 'Conversion arrêtée : rien n’a été enregistré.' });
    } catch (e) {
      setMessage({ type: 'echec', texte: 'La conversion a échoué : ' + raison(e) });
    }
  }, [montage, selection, mener]);

  // Les octets d'une source que plus aucun etat de l'historique ne monte peuvent partir, et ses dessins avec.
  useEffect(() => {
    const utiles = sourcesUtiles(h);
    for (const id of [...octets.current.keys()]) {
      if (!utiles.has(id)) { octets.current.delete(id); oublierSource(id); }
    }
  }, [h]);

  return {
    montage, peutAnnuler: h.passe.length > 0, peutRetablir: h.futur.length > 0,
    selection, setSelection, palier, setPalier, message, setMessage, travail, occupe: travail !== null, arretable, interrompre,
    ajouterFichiers, insererPageBlanche, enregistrer, enregistrerScission, convertirEn, ...verbes
  };
}

export type Atelier = ReturnType<typeof useAtelier>;
