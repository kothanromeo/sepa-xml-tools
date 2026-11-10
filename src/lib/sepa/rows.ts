import { checkBic, checkIban, SEPA } from '../iban';
import { parseAmount } from './amount';
import type { Address, Debit, Sequence, Transfer } from './build';
import { parseDate, today } from './dates';
import { sepaId, sepaText } from './text';

/*
 * Lignes d'un tableau (Excel, CSV ou saisie) → virements ou prélèvements contrôlés.
 * Chaque ligne produit des messages : « error » bloque la génération, « warning » et « info » non.
 */

export type Kind = 'credit' | 'debit';
export type Field =
  | 'name' | 'iban' | 'bic' | 'amount' | 'reference' | 'remittance'
  | 'mandateId' | 'mandateDate' | 'sequence' | 'street' | 'postcode' | 'city' | 'country';

export const FIELD_LABELS: Record<Field, string> = {
  name: 'Nom',
  iban: 'IBAN',
  bic: 'BIC',
  amount: 'Montant',
  reference: 'Référence',
  remittance: 'Libellé',
  mandateId: 'RUM (référence du mandat)',
  mandateDate: 'Date de signature du mandat',
  sequence: 'Séquence',
  street: 'Adresse',
  postcode: 'Code postal',
  city: 'Ville',
  country: 'Pays',
};

export const FIELDS: Record<Kind, Field[]> = {
  credit: ['name', 'iban', 'bic', 'amount', 'remittance', 'reference', 'street', 'postcode', 'city', 'country'],
  debit: ['name', 'iban', 'bic', 'amount', 'mandateId', 'mandateDate', 'sequence', 'remittance', 'reference', 'street', 'postcode', 'city', 'country'],
};

/** Champs affichés dans la grille de saisie (les autres restent possibles via un fichier). */
export const GRID_FIELDS: Record<Kind, Field[]> = {
  credit: ['name', 'iban', 'bic', 'amount', 'remittance', 'reference'],
  debit: ['name', 'iban', 'bic', 'amount', 'mandateId', 'mandateDate', 'sequence', 'remittance'],
};

const HEADER_PATTERNS: [Field, RegExp][] = [
  ['mandateId', /\brum\b|mandat.*(r[eé]f|id|num)|r[eé]f.*mandat|mandate ?id/],
  ['mandateDate', /date.*(sign|mandat)|sign.*date|^sign[eé]|dtofsgntr/],
  ['sequence', /s[eé]quence|seqtp|type de pr[eé]l|^type$|r[eé]currence/],
  ['iban', /iban|compte|rib/],
  ['bic', /\bbic\b|swift/],
  ['amount', /montant|amount|somme|\bprix\b|total|€|cotisation|loyer|[aà] payer|\bnet\b/],
  ['remittance', /libell|motif|objet|communication|remittance|ustrd|message/],
  ['reference', /r[eé]f[eé]rence|endtoend|\bref\b|n° ?facture|num[eé]ro de facture/],
  ['postcode', /code ?postal|\bcp\b|postcode|zip/],
  ['city', /ville|commune|city|localit/],
  ['country', /^pays|country/],
  ['street', /adresse|rue|street|voie/],
  ['name', /nom|name|b[eé]n[eé]ficiaire|d[eé]biteur|raison|soci[eé]t[eé]|client|fournisseur|salari|tiers|adh[eé]rent|membre/],
];

export type Mapping = Partial<Record<Field, number>>;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function guessMapping(kind: Kind, headers: string[], rows: string[][] = []): Mapping {
  const allowed = new Set(FIELDS[kind]);
  const m: Mapping = {};
  const used = new Set<number>();
  for (const [field, re] of HEADER_PATTERNS) {
    if (!allowed.has(field) || m[field] !== undefined) continue;
    const idx = headers.findIndex((h, i) => !used.has(i) && (re.test(h.toLowerCase()) || re.test(norm(h))));
    if (idx >= 0) {
      m[field] = idx;
      used.add(idx);
    }
  }
  // Colonnes sans en-tête reconnaissable : on devine IBAN et montant d'après le contenu.
  const sample = rows.slice(0, 50);
  const ratio = (i: number, test: (v: string) => boolean) => {
    const vals = sample.map((r) => (r[i] ?? '').trim()).filter(Boolean);
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  for (let i = 0; i < headers.length; i++) {
    if (used.has(i)) continue;
    if (m.iban === undefined && ratio(i, (v) => /^[A-Z]{2}\d{2}[A-Z0-9 ]{10,40}$/i.test(v)) >= 0.6) { m.iban = i; used.add(i); continue; }
    if (m.amount === undefined && ratio(i, (v) => parseAmount(v).cents !== undefined) >= 0.8) { m.amount = i; used.add(i); }
  }
  return m;
}

export type Level = 'error' | 'warning' | 'info';
export interface Issue {
  level: Level;
  field?: Field;
  message: string;
}

export interface RowCheck<T> {
  index: number;
  value?: T;
  issues: Issue[];
}

/** Pays de l'Espace économique européen : hors EEE, le BIC et l'adresse deviennent nécessaires. */
export const EEA = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'IS', 'LI', 'NO',
  // Départements et collectivités d'outre-mer rattachés à la France pour le SEPA
  'GF', 'GP', 'MQ', 'RE', 'YT', 'BL', 'MF', 'PM',
]);

const COUNTRY_NAMES: Record<string, string> = {
  france: 'FR', belgique: 'BE', allemagne: 'DE', espagne: 'ES', italie: 'IT', luxembourg: 'LU', 'pays-bas': 'NL',
  'pays bas': 'NL', suisse: 'CH', portugal: 'PT', monaco: 'MC', 'royaume-uni': 'GB', 'royaume uni': 'GB', irlande: 'IE',
  autriche: 'AT', pologne: 'PL',
};

function country(raw: string | undefined): string | undefined {
  const s = norm(raw ?? '');
  if (!s) return undefined;
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_NAMES[s];
}

const cell = (row: string[], m: Mapping, f: Field) => (m[f] === undefined ? '' : String(row[m[f]!] ?? '').trim());

interface Common {
  name: string;
  iban: string;
  bic?: string;
  cents: number;
  endToEndId: string;
  remittance?: string;
  address?: Address;
}

function checkCommon(row: string[], m: Mapping, kind: Kind, issues: Issue[]): Common | undefined {
  const who = kind === 'credit' ? 'bénéficiaire' : 'débiteur';
  let ok = true;

  const nameRaw = cell(row, m, 'name');
  const name = sepaText(nameRaw, 70);
  if (!name.text) {
    issues.push({ level: 'error', field: 'name', message: `Nom du ${who} absent.` });
    ok = false;
  } else {
    if (name.truncated) issues.push({ level: 'warning', field: 'name', message: `Nom coupé à 70 caractères : « ${name.text} ».` });
    else if (name.changed) issues.push({ level: 'info', field: 'name', message: `Nom transmis sous la forme « ${name.text} » (caractères SEPA).` });
  }

  const ibanRes = checkIban(cell(row, m, 'iban'));
  let iban = ibanRes.value;
  if (ibanRes.status === 'empty') {
    issues.push({ level: 'error', field: 'iban', message: 'IBAN absent.' });
    ok = false;
  } else if (ibanRes.status === 'format' && ibanRes.rib) {
    issues.push({ level: 'warning', field: 'iban', message: `RIB converti en IBAN : ${ibanRes.pretty}.` });
  } else if (ibanRes.status !== 'ok') {
    issues.push({ level: 'error', field: 'iban', message: ibanRes.message });
    ok = false;
  } else if (!SEPA.has(ibanRes.country!)) {
    issues.push({ level: 'error', field: 'iban', message: `IBAN ${ibanRes.country} : pays hors zone SEPA.` });
    ok = false;
  }
  const ibanCountry = iban.slice(0, 2);

  const bicRaw = cell(row, m, 'bic');
  let bic: string | undefined;
  if (bicRaw) {
    const b = checkBic(bicRaw, ibanCountry);
    if (b.status === 'ok') bic = b.value;
    else {
      issues.push({ level: 'error', field: 'bic', message: b.message });
      ok = false;
    }
  } else if (iban && !EEA.has(ibanCountry)) {
    issues.push({ level: 'warning', field: 'bic', message: `IBAN ${ibanCountry} (hors Espace économique européen) : le BIC est demandé par la plupart des banques.` });
  }

  const amount = parseAmount(cell(row, m, 'amount'));
  if (amount.error) {
    issues.push({ level: 'error', field: 'amount', message: amount.error });
    ok = false;
  }

  const refRaw = cell(row, m, 'reference');
  const ref = sepaId(refRaw, 35);
  if (refRaw && ref.truncated) issues.push({ level: 'warning', field: 'reference', message: `Référence coupée à 35 caractères : « ${ref.text} ».` });
  else if (refRaw && ref.changed) issues.push({ level: 'info', field: 'reference', message: `Référence transmise sous la forme « ${ref.text} ».` });

  const remRaw = cell(row, m, 'remittance');
  const rem = sepaText(remRaw, 140);
  if (rem.truncated) issues.push({ level: 'warning', field: 'remittance', message: 'Libellé coupé à 140 caractères.' });

  let address: Address | undefined;
  const city = sepaText(cell(row, m, 'city'), 35).text;
  const ctry = country(cell(row, m, 'country')) ?? (city ? ibanCountry : undefined);
  if (city && ctry) {
    address = {
      city,
      country: ctry,
      street: sepaText(cell(row, m, 'street'), 70).text || undefined,
      postcode: sepaText(cell(row, m, 'postcode'), 16).text || undefined,
    };
  } else if (iban && !EEA.has(ibanCountry) && kind === 'debit') {
    issues.push({ level: 'warning', field: 'city', message: `Débiteur hors Espace économique européen (${ibanCountry}) : son adresse (ville et pays au minimum) est exigée.` });
  }

  if (!ok) return undefined;
  return {
    name: name.text,
    iban,
    bic,
    cents: amount.cents!,
    endToEndId: ref.text || 'NOTPROVIDED',
    remittance: rem.text || undefined,
    address,
  };
}

export function checkTransferRow(row: string[], m: Mapping, index: number): RowCheck<Transfer> {
  const issues: Issue[] = [];
  const c = checkCommon(row, m, 'credit', issues);
  return { index, issues, value: c };
}

const SEQ_WORDS: [RegExp, Sequence][] = [
  [/^(frst|first|premier|1er|initial)/, 'FRST'],
  [/^(rcur|recur|r[eé]current|r[eé]gulier|suivant)/, 'RCUR'],
  [/^(ooff|oneoff|one-off|ponctuel|unique)/, 'OOFF'],
  [/^(fnal|final|dernier)/, 'FNAL'],
];

export function parseSequence(raw: string): Sequence | undefined {
  const s = norm(raw);
  if (!s) return 'RCUR';
  return SEQ_WORDS.find(([re]) => re.test(s))?.[1];
}

export function checkDebitRow(row: string[], m: Mapping, index: number, collectionDate?: string): RowCheck<Debit> {
  const issues: Issue[] = [];
  const c = checkCommon(row, m, 'debit', issues);
  let ok = !!c;

  const rumRaw = cell(row, m, 'mandateId');
  const rum = sepaId(rumRaw, 35);
  if (!rum.text) {
    issues.push({ level: 'error', field: 'mandateId', message: 'Référence unique du mandat (RUM) absente.' });
    ok = false;
  } else if (rum.truncated) {
    issues.push({ level: 'error', field: 'mandateId', message: 'La RUM dépasse 35 caractères.' });
    ok = false;
  } else if (rum.changed) {
    issues.push({ level: 'warning', field: 'mandateId', message: `RUM transmise sous la forme « ${rum.text} » : elle doit rester identique d’un prélèvement à l’autre.` });
  }

  const dateRaw = cell(row, m, 'mandateDate');
  const date = parseDate(dateRaw);
  if (!dateRaw) {
    issues.push({ level: 'error', field: 'mandateDate', message: 'Date de signature du mandat absente.' });
    ok = false;
  } else if (!date) {
    issues.push({ level: 'error', field: 'mandateDate', message: `« ${dateRaw} » n’est pas une date lisible (JJ/MM/AAAA).` });
    ok = false;
  } else if (date > (collectionDate ?? today())) {
    issues.push({ level: 'error', field: 'mandateDate', message: 'Le mandat est signé après la date de prélèvement.' });
    ok = false;
  }

  const seqRaw = cell(row, m, 'sequence');
  const sequence = parseSequence(seqRaw);
  if (!sequence) {
    issues.push({ level: 'error', field: 'sequence', message: `Séquence « ${seqRaw} » inconnue : FRST, RCUR, OOFF ou FNAL.` });
    ok = false;
  }

  if (!ok || !c) return { index, issues };
  return { index, issues, value: { ...c, mandateId: rum.text, mandateDate: date!, sequence: sequence! } };
}

/** Références de bout en bout utilisées plusieurs fois (hors NOTPROVIDED). */
export function duplicateRefs(values: { endToEndId: string }[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) {
    if (v.endToEndId === 'NOTPROVIDED') continue;
    if (seen.has(v.endToEndId)) dup.add(v.endToEndId);
    seen.add(v.endToEndId);
  }
  return dup;
}
