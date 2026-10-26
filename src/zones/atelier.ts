// L'etat de la page et ses verbes : le montage et son historique, la selection, les octets des sources, et les
// gestes qui les changent. Les composants ne font que lire cet etat et appeler ces verbes ; le calcul est dans
// engine/, l'ecriture dans export/, les fichiers et pdf.js dans io/.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ajouterSource, deplacerPages, garderPages, inverserPages, nomsDesParties, pivoterPages, retirerPages, scinder, type RegleScission
} from '../engine/montage.js';
import { SELECTION_VIDE, type Selection } from '../engine/selection.js';
import { PALIER_DEFAUT } from '../engine/zoom.js';
import { assembler } from '../export/assemblage.js';
import { ecrireZip } from '../export/zip.js';
import { declarerSource, oublierSource } from '../io/apercu.js';
import { fichierPdf, lirePdf } from '../io/lecture.js';
import { convertir, EXTENSIONS, TYPES_MIME, type FormatConversion } from '../io/conversion.js';
import { lireFichier, telecharger } from '../io/fichiers.js';
import { MONTAGE_VIDE, type Montage } from '../model/montage.js';
import { annuler as annulerH, avancer, historique, retablir as retablirH, type Historique } from '../util/historique.js';

export type Message = { readonly type: 'info' | 'alerte' | 'echec'; readonly texte: string };

/** Le nom du fichier enregistre : celui du premier PDF ouvert, ou « document.pdf ». */
export const nomDeSortie = (m: Montage): string => (m.sources[0]?.nom.replace(/\.pdf$/i, '') || 'document') + '.pdf';

const raison = (e: unknown): string => (e instanceof Error ? e.message : 'Erreur inattendue.');

const pluriel = (n: number, mot: string): string => n + ' ' + mot + (n > 1 ? 's' : '');

export function useAtelier() {
  const [h, setH] = useState<Historique<Montage>>(() => historique(MONTAGE_VIDE));
  const [selection, setSelection] = useState<Selection>(SELECTION_VIDE);
  const [palier, setPalier] = useState(PALIER_DEFAUT);
  const [message, setMessage] = useState<Message | null>(null);
  const [occupe, setOccupe] = useState(false);
  const octets = useRef(new Map<string, Uint8Array>());
  // Le dernier etat rendu, pour les gestes asynchrones : un ajout calcule ses identifiants sur le montage du moment.
  const dernier = useRef(h);
  dernier.current = h;
  const montage = h.present;

  /** Garde les octets des sources montees et oublie les autres : un montage annule peut les redemander. */
  const appliquer = useCallback((f: (m: Montage) => Montage, cle: string | null = null) => {
    setH(prec => avancer(prec, f(prec.present), cle));
  }, []);

  const ajouterFichiers = useCallback(async (fichiers: readonly File[], avant?: number) => {
    const pdfs = fichiers.filter(fichierPdf);
    const refus = fichiers.filter(f => !fichierPdf(f)).map(f => '« ' + f.name + ' » n’est pas un PDF.');
    setOccupe(true);
    const lus: { nom: string; octets: Uint8Array; pages: Awaited<ReturnType<typeof lirePdf>> }[] = [];
    for (const f of pdfs) {
      try {
        const brut = await lireFichier(f);
        lus.push({ nom: f.name, octets: brut, pages: await lirePdf(brut) });
      } catch (e) {
        refus.push('« ' + f.name + ' » : ' + raison(e));
      }
    }
    setOccupe(false);
    let m = dernier.current.present, position = avant ?? m.pages.length, ajoutees = 0;
    for (const l of lus) {
      if ('erreur' in l.pages) { refus.push('« ' + l.nom + ' » : ' + l.pages.erreur); continue; }
      m = ajouterSource(m, l.nom, l.pages.pages, position);
      position += l.pages.pages.length;
      ajoutees += l.pages.pages.length;
      const id = m.sources[m.sources.length - 1]?.id;
      if (id !== undefined) { octets.current.set(id, l.octets); declarerSource(id, l.octets); }
    }
    const suivant = avancer(dernier.current, m);
    dernier.current = suivant;
    setH(suivant);
    if (refus.length > 0) setMessage({ type: 'echec', texte: refus.join(' ') });
    else if (ajoutees > 0) setMessage({ type: 'info', texte: pluriel(ajoutees, 'page') + ' ajoutée' + (ajoutees > 1 ? 's' : '') + '.' });
  }, []);

  const verbes = useMemo(() => ({
    annuler: () => setH(annulerH),
    retablir: () => setH(retablirH),
    retirer: (ids: ReadonlySet<string>) => { appliquer(m => retirerPages(m, ids)); setSelection(SELECTION_VIDE); },
    garder: (ids: ReadonlySet<string>) => appliquer(m => garderPages(m, ids)),
    deplacer: (ids: ReadonlySet<string>, avant: number) => appliquer(m => deplacerPages(m, ids, avant)),
    pivoter: (ids: ReadonlySet<string>, sens: 1 | -1) => appliquer(m => pivoterPages(m, ids, sens)),
    inverser: (ids: ReadonlySet<string>) => appliquer(m => inverserPages(m, ids)),
    vider: () => { appliquer(() => MONTAGE_VIDE); setSelection(SELECTION_VIDE); }
  }), [appliquer]);

  /** Ecrit un montage et le telecharge ; le message dit ce qui est parti, ou pourquoi rien n'est parti. */
  const enregistrer = useCallback(async (m: Montage, nom: string) => {
    setOccupe(true);
    try {
      telecharger(await assembler(m, octets.current), nom, 'application/pdf');
      setMessage({ type: 'info', texte: '« ' + nom + ' » enregistré (' + pluriel(m.pages.length, 'page') + ').' });
    } catch (e) {
      setMessage({ type: 'echec', texte: raison(e) });
    } finally {
      setOccupe(false);
    }
  }, []);

  /** Scinde le montage et telecharge les parties : une seule s'enregistre en PDF, plusieurs en une archive ZIP. */
  const enregistrerScission = useCallback(async (regle: RegleScission) => {
    const parties = scinder(montage, regle);
    const base = nomDeSortie(montage);
    const noms = nomsDesParties(base, parties.length);
    setOccupe(true);
    try {
      const fichiers = [];
      for (const [k, p] of parties.entries()) fichiers.push({ nom: noms[k] ?? 'partie.pdf', donnees: await assembler(p, octets.current) });
      const seul = fichiers[0];
      if (fichiers.length === 1 && seul !== undefined) telecharger(seul.donnees, seul.nom, 'application/pdf');
      else telecharger(ecrireZip(fichiers), base.replace(/\.pdf$/i, '') + '.zip', 'application/zip');
      setMessage({ type: 'info', texte: pluriel(fichiers.length, 'fichier') + ' enregistré' + (fichiers.length > 1 ? 's' : '') + '.' });
    } catch (e) {
      setMessage({ type: 'echec', texte: raison(e) });
    } finally {
      setOccupe(false);
    }
  }, [montage]);

  /**
   * Convertit en PowerPoint ou en Word le montage entier, ou seulement les pages choisies. La region vocale annonce
   * l'avancee toutes les dix pages, et la barre d'etat a chaque page.
   */
  const convertirEn = useCallback(async (format: FormatConversion, seulementChoisies: boolean) => {
    const m = seulementChoisies ? { ...montage, pages: montage.pages.filter(p => selection.ids.has(p.id)) } : montage;
    const nom = nomDeSortie(montage).replace(/\.pdf$/i, '') + '.' + EXTENSIONS[format];
    setOccupe(true);
    try {
      const octetsConvertis = await convertir(m, format, (fait, total) => {
        setMessage({ type: 'info', texte: 'Conversion : page ' + fait + ' sur ' + total + '…' });
      });
      telecharger(octetsConvertis, nom, TYPES_MIME[format]);
      setMessage({ type: 'info', texte: '« ' + nom + ' » enregistré (' + pluriel(m.pages.length, 'page') + ').' });
    } catch (e) {
      setMessage({ type: 'echec', texte: 'La conversion a échoué : ' + raison(e) });
    } finally {
      setOccupe(false);
    }
  }, [montage, selection]);

  // Les octets d'une source que plus aucun etat de l'historique ne monte peuvent partir, et ses dessins avec.
  useEffect(() => {
    const utiles = new Set([h.present, ...h.passe, ...h.futur].flatMap(m => m.sources.map(s => s.id)));
    for (const id of [...octets.current.keys()]) {
      if (!utiles.has(id)) { octets.current.delete(id); oublierSource(id); }
    }
  }, [h]);

  return {
    montage, peutAnnuler: h.passe.length > 0, peutRetablir: h.futur.length > 0,
    selection, setSelection, palier, setPalier, message, setMessage, occupe,
    ajouterFichiers, enregistrer, enregistrerScission, convertirEn, ...verbes
  };
}

export type Atelier = ReturnType<typeof useAtelier>;
