export type Status = 'ok' | 'invalid' | 'format' | 'unverifiable' | 'empty';

/** Retire espaces, points, tirets ; détecte la notation scientifique d'Excel (5,52E+08). */
export function clean(raw: string | number | undefined): { value: string; scientific: boolean } {
  const s = String(raw ?? '').trim();
  const scientific = /^\d+([.,]\d+)?E\+?\d+$/i.test(s.replace(/\s/g, ''));
  return { value: s.replace(/[\s.\-_/  ]/g, '').toUpperCase(), scientific };
}
