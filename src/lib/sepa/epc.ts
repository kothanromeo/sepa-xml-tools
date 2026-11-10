import { encode } from 'uqr';
import { checkBic, checkIban, mod97, SEPA } from '../iban';
import { parseAmount, xmlAmount } from './amount';

/*
 * QR code de paiement SEPA (« EPC QR code », document EPC069-12 v3.0) :
 *   BCD / 002 / 1 (UTF-8) / SCT / BIC (facultatif en v2) / nom (70) / IBAN / EUR + montant /
 *   code motif (4) / référence structurée (35) OU libellé (140) / information (70)
 * Lignes séparées par un saut de ligne, sans séparateur après le dernier élément renseigné.
 * Charge utile limitée à 331 octets, correction d'erreur M, version 13 au plus.
 */

export const EPC_MAX_BYTES = 331;

export interface EpcInput {
  name: string;
  iban: string;
  bic?: string;
  amount?: string;
  purpose?: string;
  /** Référence structurée (ISO 11649, RF…) : exclusive du libellé. */
  reference?: string;
  text?: string;
  info?: string;
}

export interface EpcResult {
  payload?: string;
  bytes: number;
  errors: string[];
  warnings: string[];
}

const utf8 = (s: string) => new TextEncoder().encode(s);

export function buildEpc(input: EpcInput): EpcResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (!name) errors.push('Le nom du bénéficiaire est obligatoire.');
  else if (name.length > 70) errors.push('Le nom du bénéficiaire dépasse 70 caractères.');

  const iban = checkIban(input.iban);
  if (iban.status === 'empty') errors.push('L’IBAN est obligatoire.');
  else if (iban.status !== 'ok') errors.push(`IBAN : ${iban.message}`);
  else if (!SEPA.has(iban.country!)) errors.push('IBAN hors zone SEPA.');

  let bic = '';
  if (input.bic?.trim()) {
    const b = checkBic(input.bic, iban.country);
    if (b.status !== 'ok') errors.push(`BIC : ${b.message}`);
    else bic = b.value;
  }

  let amount = '';
  if (input.amount?.trim()) {
    const a = parseAmount(input.amount);
    if (a.error) errors.push(`Montant : ${a.error}`);
    else amount = `EUR${xmlAmount(a.cents!)}`;
  }

  const purpose = (input.purpose ?? '').trim().toUpperCase();
  if (purpose && !/^[A-Z0-9]{1,4}$/.test(purpose)) errors.push('Le code motif fait 4 caractères au plus (ex. GDDS, SUPP).');

  const reference = (input.reference ?? '').replace(/\s+/g, '').toUpperCase();
  const text = (input.text ?? '').replace(/\s+/g, ' ').trim();
  if (reference && text) errors.push('Choisissez une référence structurée ou un libellé, pas les deux.');
  if (reference.length > 35) errors.push('La référence structurée dépasse 35 caractères.');
  if (reference.startsWith('RF') && !rfValid(reference)) errors.push('Référence RF invalide : ses 2 chiffres de contrôle ne correspondent pas.');
  if (text.length > 140) errors.push('Le libellé dépasse 140 caractères.');

  const info = (input.info ?? '').replace(/\s+/g, ' ').trim();
  if (info.length > 70) errors.push('L’information au payeur dépasse 70 caractères.');

  if (!amount) warnings.push('Sans montant, le payeur devra le saisir lui-même.');

  const lines = ['BCD', '002', '1', 'SCT', bic, name, iban.value, amount, purpose, reference, text, info];
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const payload = lines.join('\n');
  const bytes = utf8(payload).length;
  if (bytes > EPC_MAX_BYTES) errors.push(`Contenu trop long : ${bytes} octets pour 331 au maximum. Raccourcissez le libellé.`);
  return errors.length ? { bytes, errors, warnings } : { payload, bytes, errors, warnings };
}

/** Matrice du QR code (true = module noir), au format exigé par l'EPC : niveau M, version 13 au plus. */
export function epcMatrix(payload: string) {
  return encode([...utf8(payload)], { ecc: 'M', maxVersion: 13, border: 0 });
}

/** SVG autonome du QR code, avec une marge de 4 modules. */
export function epcSvg(payload: string, moduleSize = 8): string {
  const qr = epcMatrix(payload);
  const margin = 4;
  const n = qr.size + margin * 2;
  let path = '';
  qr.data.forEach((row, y) => row.forEach((on, x) => {
    if (on) path += `M${x + margin} ${y + margin}h1v1h-1z`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * moduleSize}" height="${n * moduleSize}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/* Référence structurée du créancier ISO 11649 : RF + 2 chiffres de contrôle + 1 à 21 caractères. */

const toDigits = (s: string) => [...s].map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c)).join('');

export function rfValid(ref: string): boolean {
  const r = ref.replace(/\s+/g, '').toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(r)) return false;
  return mod97(toDigits(r.slice(4) + r.slice(0, 4))) === 1;
}

/** Construit une référence RF à partir d'une référence interne (numéro de facture…). */
export function rfFrom(base: string): string | undefined {
  const b = base.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!b || b.length > 21) return undefined;
  const check = 98 - mod97(toDigits(b + 'RF00'));
  return `RF${String(check).padStart(2, '0')}${b}`;
}

export const prettyRf = (rf: string) => rf.replace(/(.{4})/g, '$1 ').trim();
