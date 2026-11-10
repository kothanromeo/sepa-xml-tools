/* Montants : saisie souple (1 234,56 € ; 1234.56 ; 1.234,56), stockage en centimes. */

export const MAX_CENTS = 99_999_999_999; // 999 999 999,99 €

export interface AmountResult {
  cents?: number;
  error?: string;
}

export function parseAmount(raw: string | number | undefined): AmountResult {
  if (typeof raw === 'number') raw = String(raw);
  let s = String(raw ?? '').replace(/[\s  ]/g, '').replace(/€|EUR/gi, '');
  if (!s) return { error: 'Montant absent.' };
  if (/^-/.test(s)) return { error: 'Montant négatif : un virement ou un prélèvement est toujours positif.' };
  s = s.replace(/^\+/, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Le dernier séparateur est le séparateur décimal, l'autre sépare les milliers.
    const dec = lastComma > lastDot ? ',' : '.';
    const thousands = dec === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(dec, '.');
  } else if (lastComma >= 0) {
    s = (s.match(/,/g)!.length > 1 ? s.split(',').join('') : s.replace(',', '.'));
  } else if (lastDot >= 0 && s.match(/\./g)!.length > 1) {
    s = s.split('.').join('');
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return { error: `« ${raw} » n’est pas un montant lisible.` };
  const [int, frac = ''] = s.split('.');
  if (frac.length > 2 && !/^0+$/.test(frac.slice(2))) return { error: `« ${raw} » a plus de 2 décimales.` };
  const cents = Number(int) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return { error: `« ${raw} » est trop grand.` };
  if (cents === 0) return { error: 'Montant nul.' };
  if (cents > MAX_CENTS) return { error: 'Montant supérieur au maximum SEPA (999 999 999,99 €).' };
  return { cents };
}

/** 123456 → "1234.56" (format XML). */
export const xmlAmount = (cents: number) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** 123456 → "1 234,56 €" (affichage). */
export const euros = (cents: number) =>
  (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }).replace(/ /g, ' ');
