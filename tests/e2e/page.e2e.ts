// La page construite, dans un vrai navigateur : ouvrir deux PDF, voir leurs vignettes, zoomer la grille et
// l'apercu, ranger, scinder, enregistrer. NAVIGATEUR choisit le moteur (chromium par defaut).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, firefox, webkit, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join } from 'node:path';
import { a4, pagesDe, pdfTemoin } from '../aide/pdfs.js';

const MOTEURS = { chromium, firefox, webkit };
const moteur = MOTEURS[(process.env.NAVIGATEUR ?? 'chromium') as keyof typeof MOTEURS] ?? chromium;
const PORT = 5398;
let navigateur: Browser, serveur: Server;

beforeAll(async () => {
  const { servir } = await import(join(__dirname, '../../scripts/servir.mjs')) as { servir: (port: number) => Promise<Server> };
  serveur = await servir(PORT);
  // CHEMIN_NAVIGATEUR : un navigateur deja installe, d'une autre version que celle du paquet (une machine sans reseau).
  const chemin = process.env.CHEMIN_NAVIGATEUR;
  navigateur = await moteur.launch(chemin ? { executablePath: chemin } : {});
});
afterAll(async () => { await navigateur?.close(); serveur?.close(); });

async function ouvrirPage(): Promise<{ page: Page; erreurs: string[] }> {
  const page = await navigateur.newPage({ acceptDownloads: true });
  const erreurs: string[] = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.goto('http://127.0.0.1:' + PORT + '/pdf.html');
  return { page, erreurs };
}

async function deposer(page: Page, fichiers: { name: string; octets: Uint8Array }[]): Promise<void> {
  await page.locator('input[type=file]').setInputFiles(fichiers.map(f => ({ name: f.name, mimeType: 'application/pdf', buffer: Buffer.from(f.octets) })));
}

const largeurs = (page: Page) => page.locator('.vignette').evaluateAll(els => els.map(e => (e as HTMLElement).offsetWidth));

describe('la page', () => {
  it('fusionne deux PDF, dessine les vignettes et zoome la grille', async () => {
    const { page, erreurs } = await ouvrirPage();
    await deposer(page, [{ name: 'a.pdf', octets: await pdfTemoin('A', a4(3)) }, { name: 'b.pdf', octets: await pdfTemoin('B', [{ largeur: 842, hauteur: 595 }]) }]);
    await expect.poll(() => page.locator('.vignette').count()).toBe(4);
    await expect.poll(() => page.locator('[role=status]').textContent()).toContain('4 pages ajoutées');
    // pdf.js a dessine : la toile de la premiere vignette n'est plus blanche.
    await expect.poll(() => page.locator('.vignette canvas').first().evaluate(c => {
      const t = c as HTMLCanvasElement, d = t.getContext('2d')?.getImageData(0, 0, t.width, t.height).data ?? [];
      for (let i = 0; i < d.length; i += 4) if ((d[i] ?? 255) < 128) return true;
      return false;
    }), { timeout: 20_000 }).toBe(true);

    const avant = await largeurs(page);
    await page.getByRole('button', { name: 'Vignettes plus grandes' }).click();
    await expect.poll(async () => (await largeurs(page))[0]).toBeGreaterThan(avant[0] ?? 0);
    await page.locator('.grille').focus();
    await page.keyboard.press('-');
    await page.keyboard.press('-');
    await expect.poll(async () => (await largeurs(page))[0]).toBeLessThan(avant[0] ?? 0);
    expect(erreurs).toEqual([]);
    await page.close();
  });

  it('ouvre une page en grand et la zoome', async () => {
    const { page, erreurs } = await ouvrirPage();
    await deposer(page, [{ name: 'a.pdf', octets: await pdfTemoin('A', a4(2)) }]);
    await page.locator('.vignette').first().dblclick();
    const dialogue = page.getByRole('dialog');
    await expect.poll(() => dialogue.isVisible()).toBe(true);
    await dialogue.getByRole('button', { name: '100 %' }).click();
    await expect.poll(() => dialogue.locator('output').textContent()).toBe('100 %');
    await dialogue.getByRole('button', { name: 'Agrandir' }).click();
    await expect.poll(() => dialogue.locator('output').textContent()).toBe('125 %');
    const largeur = await dialogue.locator('canvas').evaluate(c => (c as HTMLElement).offsetWidth);
    expect(largeur).toBe(Math.round(595 * 1.25));
    await page.keyboard.press('PageDown');
    await expect.poll(() => dialogue.getAttribute('aria-label')).toBe('Page 2 sur 2');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.getByRole('dialog').count()).toBe(0);
    expect(erreurs).toEqual([]);
    await page.close();
  });

  it('range, tourne et enregistre un PDF fidele', async () => {
    const { page, erreurs } = await ouvrirPage();
    await deposer(page, [{ name: 'rapport.pdf', octets: await pdfTemoin('A', [{ largeur: 100, hauteur: 200 }, { largeur: 300, hauteur: 400 }]) }]);
    await page.locator('.vignette').nth(1).click();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('r');
    const telechargement = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Enregistrer le PDF' }).click();
    const fichier = await telechargement;
    expect(fichier.suggestedFilename()).toBe('rapport.pdf');
    const octets = new Uint8Array(readFileSync(await fichier.path()));
    expect(await pagesDe(octets)).toEqual([{ largeur: 300, hauteur: 400, rotation: 90 }, { largeur: 100, hauteur: 200, rotation: 0 }]);
    expect(erreurs).toEqual([]);
    await page.close();
  });

  it('scinde en une archive de plusieurs PDF', async () => {
    const { page, erreurs } = await ouvrirPage();
    await deposer(page, [{ name: 'livre.pdf', octets: await pdfTemoin('A', a4(5)) }]);
    await page.getByRole('button', { name: 'Scinder…' }).click();
    const boite = page.getByRole('dialog');
    await boite.getByLabel('Pages par fichier').fill('2');
    await expect.poll(() => boite.locator('.liste-parties li').allTextContents()).toEqual(['livre-1.pdf — pages 1-2', 'livre-2.pdf — pages 3-4', 'livre-3.pdf — page 5']);
    const telechargement = page.waitForEvent('download');
    await boite.getByRole('button', { name: 'Enregistrer les 3 fichiers' }).click();
    const fichier = await telechargement;
    expect(fichier.suggestedFilename()).toBe('livre.zip');
    const zip = readFileSync(await fichier.path());
    expect(zip.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');
    expect(zip.toString('latin1')).toContain('livre-3.pdf');
    expect(erreurs).toEqual([]);
    await page.close();
  });

  it('n a aucune violation d accessibilite grave', async () => {
    const { page } = await ouvrirPage();
    const axe = readFileSync(join(__dirname, '../../node_modules/axe-core/axe.min.js'), 'utf8');
    const auditer = async () => {
      await page.addScriptTag({ content: axe });
      return page.evaluate(async () => {
        const r = await (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; impact: string }[] }> } }).axe.run();
        return r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id);
      });
    };
    expect(await auditer()).toEqual([]);
    await deposer(page, [{ name: 'a.pdf', octets: await pdfTemoin('A', a4(3)) }]);
    await expect.poll(() => page.locator('.vignette').count()).toBe(3);
    expect(await auditer()).toEqual([]);
    await page.close();
  });
});
