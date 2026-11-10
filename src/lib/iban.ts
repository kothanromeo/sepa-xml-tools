import { clean, type Status } from './ids';

/*
 * IBAN (ISO 13616) : code pays, 2 chiffres de contrôle, BBAN. Contrôle par le modulo 97
 * et la longueur propre à chaque pays. Pour la France et Monaco, la clé RIB contenue
 * dans le BBAN est vérifiée en plus.
 */

export const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28,
  CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
  GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32,
  LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24,
  PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** Pays de la zone SEPA (virements et prélèvements SEPA possibles). */
export const SEPA = new Set([
  'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GI', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT',
  'LI', 'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'SM', 'VA', 'AD', 'AL', 'MD', 'ME', 'MK', 'RS',
]);

export interface IbanResult {
  status: Status;
  value: string;
  message: string;
  country?: string;
  /** Code banque, guichet, compte et clé RIB pour un IBAN français. */
  rib?: { bank: string; branch: string; account: string; key: string };
  /** Version formatée par groupes de 4. */
  pretty?: string;
}

/** Modulo 97 d'une chaîne de chiffres arbitrairement longue. */
export function mod97(digits: string): number {
  let r = 0;
  for (let i = 0; i < digits.length; i += 7) r = Number(String(r) + digits.slice(i, i + 7)) % 97;
  return r;
}

const toDigits = (s: string) => [...s].map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c)).join('');

export function ibanValid(iban: string): boolean {
  return mod97(toDigits(iban.slice(4) + iban.slice(0, 4))) === 1;
}

/** Lettres du RIB : A,J → 1 ; B,K,S → 2 ; … ; I,R,Z → 9. */
const ribDigit = (c: string) => {
  if (/\d/.test(c)) return c;
  const i = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(c);
  return String(((i + (i >= 18 ? 1 : 0)) % 9) + 1);
};

export function ribKey(bank: string, branch: string, account: string): string {
  const n = (s: string) => Number([...s].map(ribDigit).join(''));
  return String(97 - ((89 * n(bank) + 15 * n(branch) + 3 * n(account)) % 97)).padStart(2, '0');
}

export function ribToIban(bank: string, branch: string, account: string, key: string, country = 'FR'): string {
  const bban = (bank + branch + account + key).toUpperCase();
  const check = 98 - mod97(toDigits(bban + country + '00'));
  return country + String(check).padStart(2, '0') + bban;
}

export const prettyIban = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim();

export function checkIban(raw: string | undefined): IbanResult {
  const { value } = clean(raw);
  if (!value) return { status: 'empty', value, message: 'IBAN absent.' };
  // RIB français saisi sans IBAN (23 caractères : banque, guichet, compte, clé)
  if (/^\d{10}[0-9A-Z]{11}\d{2}$/.test(value)) {
    const [bank, branch, account, key] = [value.slice(0, 5), value.slice(5, 10), value.slice(10, 21), value.slice(21)];
    const ok = ribKey(bank, branch, account) === key;
    const iban = ribToIban(bank, branch, account, key);
    return ok
      ? { status: 'format', value: iban, country: 'FR', rib: { bank, branch, account, key }, pretty: prettyIban(iban), message: `C’est un RIB, pas un IBAN. IBAN correspondant : ${prettyIban(iban)}.` }
      : { status: 'invalid', value, country: 'FR', message: 'RIB avec une clé incorrecte.' };
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(value)) return { status: 'format', value, message: 'Un IBAN commence par 2 lettres (pays) et 2 chiffres, suivis de chiffres et de lettres.' };
  const country = value.slice(0, 2);
  const len = IBAN_LENGTHS[country];
  if (len && value.length !== len) {
    return { status: 'format', value, country, message: `${value.length} caractères au lieu de ${len} pour un IBAN ${country} : il manque ou il y a un caractère en trop.` };
  }
  if (!ibanValid(value)) return { status: 'invalid', value, country, message: 'Chiffres de contrôle incorrects : l’IBAN contient une erreur de saisie.' };
  const result: IbanResult = { status: 'ok', value, country, pretty: prettyIban(value), message: len ? 'IBAN valide.' : `IBAN valide (longueur non vérifiée pour le pays ${country}).` };
  if (country === 'FR' || country === 'MC') {
    const bban = value.slice(4);
    const rib = { bank: bban.slice(0, 5), branch: bban.slice(5, 10), account: bban.slice(10, 21), key: bban.slice(21, 23) };
    result.rib = rib;
    if (ribKey(rib.bank, rib.branch, rib.account) !== rib.key) {
      return { ...result, status: 'invalid', message: 'IBAN cohérent, mais la clé RIB qu’il contient est fausse : vérifiez-le auprès du titulaire.' };
    }
  }
  if (!SEPA.has(country)) result.message += ' Pays hors zone SEPA : les virements SEPA ne sont pas possibles.';
  return result;
}

export function checkBic(raw: string | undefined, ibanCountry?: string): { status: Status; value: string; message: string } {
  const { value } = clean(raw);
  if (!value) return { status: 'empty', value, message: 'BIC absent.' };
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value)) {
    return { status: 'format', value, message: 'Un BIC fait 8 ou 11 caractères : 4 lettres (banque), 2 lettres (pays), 2 caractères (ville), 3 facultatifs (agence).' };
  }
  const country = value.slice(4, 6);
  // Monaco et les territoires d'outre-mer utilisent souvent des BIC de banques françaises.
  const compatible = !ibanCountry || country === ibanCountry || (ibanCountry === 'MC' && country === 'FR');
  if (!compatible) return { status: 'invalid', value, message: `Le BIC est celui d’une banque ${country}, mais l’IBAN est ${ibanCountry}.` };
  return { status: 'ok', value, message: value.endsWith('XXX') || value.length === 8 ? 'BIC valide (siège de la banque).' : 'BIC valide.' };
}
