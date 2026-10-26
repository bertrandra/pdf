// Primitives de couleur : lecture hexadecimale et contraste WCAG. Des mathematiques sans domaine, donc dans
// util/ (niveau 0, pur). Elles servent au registre des jetons (styles/jetons.ts) et a son test.

export interface Rgb { r: number; g: number; b: number }

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc` ou `#aabbcc` (diese facultatif) ; null pour tout le reste, jamais une couleur devinee. */
export function lireHex(texte: string): Rgb | null {
  const m = HEX.exec(texte.trim());
  if (m === null || m[1] === undefined) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function versHex(c: Rgb): string {
  const deux = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return '#' + deux(c.r) + deux(c.g) + deux(c.b);
}

/** Composante sRGB 0-255 vers lumiere lineaire 0-1 (courbe sRGB officielle). */
export function lineaire(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Lumiere lineaire 0-1 vers composante sRGB 0-255, non arrondie. */
export function gamma(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
}

/** Luminance relative WCAG 2.x d'une couleur sRGB : 0 pour le noir, 1 pour le blanc. */
export function luminance(c: Rgb): number {
  return 0.2126 * lineaire(c.r) + 0.7152 * lineaire(c.g) + 0.0722 * lineaire(c.b);
}

/** Le rapport de contraste WCAG 2.x entre deux couleurs : de 1 (identiques) a 21 (noir sur blanc). */
export function contraste(x: Rgb, y: Rgb): number {
  const a = luminance(x), b = luminance(y);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
