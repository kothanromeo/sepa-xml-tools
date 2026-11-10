import { checkBic, checkIban, SEPA } from '../iban';
import {
  buildCreditTransfer, buildDirectDebit, localDateTime, messageId,
  type Account, type CreditVersion, type Debit, type DebitVersion, type Transfer,
} from './build';
import { closedReason, frDate, frenchOnlyHolidays, nextBusinessDay, today } from './dates';
import { checkIcs } from './ics';
import { checkDebitRow, checkTransferRow, duplicateRefs, EEA, type Issue, type Mapping, type RowCheck } from './rows';
import { sepaText } from './text';

/* Assemblage : en-tête saisi + lignes contrôlées → fichier XML, avec tous les messages. */

export interface OwnAccount {
  name: string;
  iban: string;
  bic: string;
  street?: string;
  postcode?: string;
  city?: string;
  country?: string;
}

export interface CreditHeader extends OwnAccount {
  executionDate: string;
  version: CreditVersion;
  instant: boolean;
  batchBooking: boolean;
}

export interface DebitHeader extends OwnAccount {
  ics: string;
  collectionDate: string;
  version: DebitVersion;
  scheme: 'CORE' | 'B2B';
  batchBooking: boolean;
}

export interface Composed<T> {
  header: Issue[];
  rows: RowCheck<T>[];
  count: number;
  total: number;
  errors: number;
  warnings: number;
  xml?: string;
}

function ownAccount(h: OwnAccount, role: string, issues: Issue[]): Account | undefined {
  let ok = true;
  const name = sepaText(h.name, 70);
  if (!name.text) {
    issues.push({ level: 'error', message: `Nom du ${role} absent.` });
    ok = false;
  } else if (name.changed) {
    issues.push({ level: 'info', message: `Votre nom sera transmis sous la forme « ${name.text} ».` });
  }
  const iban = checkIban(h.iban);
  if (iban.status === 'empty') {
    issues.push({ level: 'error', message: `IBAN du ${role} absent.` });
    ok = false;
  } else if (iban.status !== 'ok' && !(iban.status === 'format' && iban.rib)) {
    issues.push({ level: 'error', message: `IBAN du ${role} : ${iban.message}` });
    ok = false;
  } else if (!SEPA.has(iban.value.slice(0, 2))) {
    issues.push({ level: 'error', message: `IBAN du ${role} hors zone SEPA.` });
    ok = false;
  }
  let bic: string | undefined;
  if (h.bic.trim()) {
    const b = checkBic(h.bic, iban.value.slice(0, 2));
    if (b.status === 'ok') bic = b.value;
    else {
      issues.push({ level: 'error', message: `BIC du ${role} : ${b.message}` });
      ok = false;
    }
  }
  const city = sepaText(h.city, 35).text;
  const country = (h.country ?? '').trim().toUpperCase();
  const address = city && /^[A-Z]{2}$/.test(country)
    ? { city, country, street: sepaText(h.street, 70).text || undefined, postcode: sepaText(h.postcode, 16).text || undefined }
    : undefined;
  return ok ? { name: name.text, iban: iban.value, bic, address } : undefined;
}

function dateIssues(date: string, label: string, min: string, issues: Issue[]): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    issues.push({ level: 'error', message: `${label} absente.` });
    return false;
  }
  if (date < min) {
    issues.push({ level: 'error', message: `${label} (${frDate(date)}) est trop proche ou déjà passée : au plus tôt le ${frDate(min)}.` });
    return false;
  }
  const closed = closedReason(date);
  if (closed) issues.push({ level: 'warning', message: `${label} : le ${frDate(date)} n’est pas un jour ouvré (${closed}). L’opération sera traitée le ${frDate(nextBusinessDay(date))}.` });
  const fr = frenchOnlyHolidays(Number(date.slice(0, 4))).get(date);
  if (fr) issues.push({ level: 'warning', message: `${label} : le ${frDate(date)} est férié en France (${fr}). Certaines banques décalent le traitement.` });
  return true;
}

function summarize<T extends { cents: number; endToEndId: string }>(rows: RowCheck<T>[], header: Issue[]): Omit<Composed<T>, 'xml'> {
  const values = rows.map((r) => r.value).filter((v): v is T => !!v);
  const dups = duplicateRefs(values);
  for (const r of rows) {
    if (r.value && dups.has(r.value.endToEndId)) r.issues.push({ level: 'warning', field: 'reference', message: `Référence « ${r.value.endToEndId} » utilisée sur plusieurs lignes.` });
  }
  const errors = header.filter((i) => i.level === 'error').length + rows.filter((r) => r.issues.some((i) => i.level === 'error')).length;
  const warnings = header.filter((i) => i.level === 'warning').length + rows.filter((r) => r.issues.some((i) => i.level === 'warning')).length;
  return { header, rows, count: values.length, total: values.reduce((s, v) => s + v.cents, 0), errors, warnings };
}

/** Lignes non vides seulement. */
const nonEmpty = (rows: string[][]) => rows.map((r, i) => [r, i] as const).filter(([r]) => r.some((c) => String(c ?? '').trim()));

export function composeCredit(h: CreditHeader, rows: string[][], m: Mapping, now = new Date()): Composed<Transfer> {
  const header: Issue[] = [];
  const debtor = ownAccount(h, 'donneur d’ordre', header);
  const dateOk = dateIssues(h.executionDate, 'Date d’exécution', today(now), header);
  const checks = nonEmpty(rows).map(([r, i]) => checkTransferRow(r, m, i));
  if (!checks.length) header.push({ level: 'error', message: 'Aucun virement à générer.' });
  if (checks.some((c) => c.value && !EEA.has(c.value.iban.slice(0, 2))) && !debtor?.address) {
    header.push({ level: 'warning', message: 'Virement vers un pays SEPA hors Espace économique européen (Suisse, Royaume-Uni, Monaco…) : votre adresse (ville et pays) doit figurer dans le fichier. Renseignez-la dans « Adresse ».' });
  }
  if (h.instant && h.version === 'pain.001.001.03') header.push({ level: 'info', message: 'Virement instantané : la version 2019 (pain.001.001.09) est recommandée par la profession bancaire.' });
  const s = summarize(checks, header);
  if (s.errors || !debtor || !dateOk) return s;
  const xml = buildCreditTransfer({
    version: h.version,
    msgId: messageId('VIR', now),
    createdAt: localDateTime(now),
    debtor,
    executionDate: h.executionDate,
    instant: h.instant,
    batchBooking: h.batchBooking,
    transfers: checks.map((c) => c.value!),
  });
  return { ...s, xml };
}

export function composeDebit(h: DebitHeader, rows: string[][], m: Mapping, now = new Date()): Composed<Debit> {
  const header: Issue[] = [];
  const creditor = ownAccount(h, 'créancier', header);
  const ics = checkIcs(h.ics);
  if (ics.status !== 'ok') header.push({ level: 'error', message: ics.message });
  // Remise au plus tard la veille ouvrée de l'échéance (D-1 TARGET) : la date ne peut pas être avant le prochain jour ouvré.
  const min = nextBusinessDay(today(now), 1);
  const dateOk = dateIssues(h.collectionDate, 'Date de prélèvement', min, header);
  if (dateOk && h.collectionDate < nextBusinessDay(today(now), 2)) {
    header.push({ level: 'warning', message: 'Échéance très proche : vérifiez l’heure limite de remise de votre banque (souvent la veille ouvrée avant midi, parfois davantage).' });
  }
  const checks = nonEmpty(rows).map(([r, i]) => checkDebitRow(r, m, i, h.collectionDate || undefined));
  if (!checks.length) header.push({ level: 'error', message: 'Aucun prélèvement à générer.' });
  if (h.scheme === 'B2B') header.push({ level: 'info', message: 'Prélèvement interentreprises (B2B) : chaque débiteur doit avoir enregistré le mandat auprès de sa banque, sinon le prélèvement est rejeté.' });
  const s = summarize(checks, header);
  if (s.errors || !creditor || !dateOk || ics.status !== 'ok') return s;
  const xml = buildDirectDebit({
    version: h.version,
    msgId: messageId('PRLV', now),
    createdAt: localDateTime(now),
    creditor,
    ics: ics.value,
    collectionDate: h.collectionDate,
    scheme: h.scheme,
    batchBooking: h.batchBooking,
    debits: checks.map((c) => c.value!),
  });
  return { ...s, xml };
}
