import { mod97 } from '../iban';
import type { Status } from '../ids';

/*
 * Identifiant créancier SEPA (ICS, « Creditor Identifier ») :
 *   code pays (2) + clé (2) + code activité (3, souvent ZZZ) + identifiant national.
 * En France : 13 caractères, l'identifiant national ayant 6 caractères (ex. FR07ZZZ591778).
 * La clé se calcule comme celle d'un IBAN (ISO 7064 MOD 97-10), sur l'identifiant national
 * suivi du code pays et de « 00 » — le code activité n'entre pas dans le calcul.
 */

const toDigits = (s: string) => [...s].map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c)).join('');

export function icsKey(country: string, nationalId: string): string {
  return String(98 - mod97(toDigits(nationalId + country + '00'))).padStart(2, '0');
}

export function checkIcs(raw: string | undefined): { status: Status; value: string; message: string } {
  const value = String(raw ?? '').replace(/[\s.\-]/g, '').toUpperCase();
  if (!value) return { status: 'empty', value, message: 'Identifiant créancier SEPA (ICS) absent.' };
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(value)) {
    return { status: 'format', value, message: 'Un ICS commence par 2 lettres (pays), 2 chiffres (clé), 3 caractères (code activité, souvent ZZZ), puis l’identifiant national.' };
  }
  const country = value.slice(0, 2);
  if (country === 'FR' && value.length !== 13) {
    return { status: 'format', value, message: `Un ICS français fait 13 caractères (ex. FR07ZZZ591778), celui-ci en a ${value.length}.` };
  }
  const expected = icsKey(country, value.slice(7));
  if (expected !== value.slice(2, 4)) {
    return { status: 'invalid', value, message: `Clé de l’ICS incorrecte : avec cet identifiant, la clé devrait être ${expected}.` };
  }
  return { status: 'ok', value, message: 'ICS valide.' };
}
