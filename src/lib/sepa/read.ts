import { checkBic, checkIban } from '../iban';
import { euros } from './amount';
import { checkIcs } from './ics';
import type { Issue } from './rows';
import { isSepaText } from './text';

/*
 * Lecture d'un fichier de remise SEPA existant (pain.001 virements, pain.008 prélèvements),
 * quelle que soit sa version : on s'appuie sur les noms locaux des éléments, pas sur l'espace de noms.
 */

export class SepaReadError extends Error {}

export interface Batch {
  id: string;
  date: string;
  name: string;
  iban: string;
  bic: string;
  ics?: string;
  sequence?: string;
  scheme?: string;
  instant: boolean;
  declaredCount?: number;
  declaredSum?: number;
  count: number;
  sum: number;
}

export interface Tx {
  batch: number;
  name: string;
  iban: string;
  bic: string;
  cents: number;
  currency: string;
  endToEndId: string;
  remittance: string;
  mandateId?: string;
  mandateDate?: string;
}

export interface SepaDoc {
  kind: 'credit' | 'debit';
  version: string;
  msgId: string;
  createdAt: string;
  initiator: string;
  declaredCount?: number;
  declaredSum?: number;
  batches: Batch[];
  txs: Tx[];
  issues: Issue[];
}

const byTag = (el: Element | Document, name: string) =>
  [...el.getElementsByTagName('*')].filter((e) => e.localName === name);
const child = (el: Element | undefined, name: string) =>
  el ? [...el.children].find((c) => c.localName === name) : undefined;
/** Suit un chemin d'enfants directs (« Dbtr/Nm »). */
function at(el: Element | undefined, path: string): Element | undefined {
  let cur = el;
  for (const p of path.split('/')) cur = child(cur, p);
  return cur;
}
const text = (el: Element | undefined, path?: string) => ((path ? at(el, path) : el)?.textContent ?? '').trim();

function cents(s: string): number {
  const m = s.trim().match(/^(\d+)(?:\.(\d{1,5}))?$/);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Math.round(Number(((m[2] ?? '') + '000').slice(0, 3)) / 10);
}

const optNumber = (s: string) => (s ? Number(s) : undefined);

function agentBic(el: Element | undefined): string {
  const fin = at(el, 'FinInstnId');
  return text(fin, 'BICFI') || text(fin, 'BIC') || (text(fin, 'Othr/Id') === 'NOTPROVIDED' ? '' : text(fin, 'Othr/Id'));
}

export function readSepa(source: string): SepaDoc {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (byTag(doc, 'parsererror').length) throw new SepaReadError('Ce fichier n’est pas un XML valide (balise mal fermée, caractère interdit ou fichier tronqué).');
  const root = doc.documentElement;
  const ns = root?.namespaceURI ?? '';
  const version = ns.match(/(pain\.\d{3}\.\d{3}\.\d{2})/)?.[1] ?? '';
  const credit = byTag(doc, 'CstmrCdtTrfInitn')[0];
  const debit = byTag(doc, 'CstmrDrctDbtInitn')[0];
  const main = credit ?? debit;
  if (!main) {
    if (byTag(doc, 'BkToCstmrStmt').length) throw new SepaReadError('C’est un relevé de compte camt.053, pas une remise de virements ou de prélèvements.');
    throw new SepaReadError('Ce XML n’est ni une remise de virements (pain.001) ni une remise de prélèvements (pain.008).');
  }
  const kind = credit ? 'credit' : 'debit';
  const gh = child(main, 'GrpHdr');
  const issues: Issue[] = [];
  const batches: Batch[] = [];
  const txs: Tx[] = [];

  for (const pi of [...main.children].filter((c) => c.localName === 'PmtInf')) {
    const tp = child(pi, 'PmtTpInf');
    const own = kind === 'credit' ? 'Dbtr' : 'Cdtr';
    const dateEl = child(pi, kind === 'credit' ? 'ReqdExctnDt' : 'ReqdColltnDt');
    const date = text(dateEl, 'Dt') || text(dateEl, 'DtTm') || text(dateEl);
    const batch: Batch = {
      id: text(pi, 'PmtInfId'),
      date,
      name: text(pi, `${own}/Nm`),
      iban: text(pi, `${own}Acct/Id/IBAN`),
      bic: agentBic(child(pi, `${own}Agt`)),
      ics: kind === 'debit' ? text(pi, 'CdtrSchmeId/Id/PrvtId/Othr/Id') : undefined,
      sequence: text(tp, 'SeqTp') || undefined,
      scheme: text(tp, 'LclInstrm/Cd') || undefined,
      instant: text(tp, 'LclInstrm/Cd') === 'INST',
      declaredCount: optNumber(text(pi, 'NbOfTxs')),
      declaredSum: text(pi, 'CtrlSum') ? cents(text(pi, 'CtrlSum')) : undefined,
      count: 0,
      sum: 0,
    };
    const b = batches.push(batch) - 1;
    const txTag = kind === 'credit' ? 'CdtTrfTxInf' : 'DrctDbtTxInf';
    const other = kind === 'credit' ? 'Cdtr' : 'Dbtr';
    for (const tx of [...pi.children].filter((c) => c.localName === txTag)) {
      const amtEl = kind === 'credit' ? at(tx, 'Amt/InstdAmt') : child(tx, 'InstdAmt');
      const t: Tx = {
        batch: b,
        name: text(tx, `${other}/Nm`),
        iban: text(tx, `${other}Acct/Id/IBAN`),
        bic: agentBic(child(tx, `${other}Agt`)),
        cents: cents(text(amtEl)),
        currency: amtEl?.getAttribute('Ccy') ?? '',
        endToEndId: text(tx, 'PmtId/EndToEndId'),
        remittance: text(tx, 'RmtInf/Ustrd'),
        mandateId: kind === 'debit' ? text(tx, 'DrctDbtTx/MndtRltdInf/MndtId') : undefined,
        mandateDate: kind === 'debit' ? text(tx, 'DrctDbtTx/MndtRltdInf/DtOfSgntr') : undefined,
      };
      txs.push(t);
      batch.count++;
      batch.sum += Number.isFinite(t.cents) ? t.cents : 0;
    }
  }

  const result: SepaDoc = {
    kind,
    version,
    msgId: text(gh, 'MsgId'),
    createdAt: text(gh, 'CreDtTm'),
    initiator: text(gh, 'InitgPty/Nm'),
    declaredCount: optNumber(text(gh, 'NbOfTxs')),
    declaredSum: text(gh, 'CtrlSum') ? cents(text(gh, 'CtrlSum')) : undefined,
    batches,
    txs,
    issues,
  };
  issues.push(...checkDoc(result));
  return result;
}

function checkDoc(d: SepaDoc): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue['level'], message: string) => out.push({ level, message });
  const total = d.txs.reduce((s, t) => s + (Number.isFinite(t.cents) ? t.cents : 0), 0);

  if (!d.version) add('warning', 'Espace de noms ISO 20022 non reconnu : la banque risque de refuser le fichier.');
  if (!d.msgId) add('error', 'Identifiant du message (MsgId) absent.');
  else if (d.msgId.length > 35) add('error', 'Identifiant du message (MsgId) de plus de 35 caractères.');
  if (d.declaredCount !== undefined && d.declaredCount !== d.txs.length) add('error', `L’en-tête annonce ${d.declaredCount} opération(s), le fichier en contient ${d.txs.length}.`);
  if (d.declaredSum !== undefined && d.declaredSum !== total) add('error', `L’en-tête annonce un total de ${euros(d.declaredSum)}, la somme des opérations fait ${euros(total)}.`);

  d.batches.forEach((b, i) => {
    const label = d.batches.length > 1 ? `Lot ${i + 1} (${b.id}) : ` : 'Lot : ';
    if (b.declaredCount !== undefined && b.declaredCount !== b.count) add('error', `${label}${b.declaredCount} opération(s) annoncée(s), ${b.count} présente(s).`);
    if (b.declaredSum !== undefined && b.declaredSum !== b.sum) add('error', `${label}total annoncé ${euros(b.declaredSum)}, somme réelle ${euros(b.sum)}.`);
    const own = checkIban(b.iban);
    if (own.status !== 'ok') add('error', `${label}IBAN du ${d.kind === 'credit' ? 'compte débité' : 'compte crédité'} : ${own.message}`);
    if (b.bic && checkBic(b.bic).status !== 'ok') add('error', `${label}BIC « ${b.bic} » mal formé.`);
    if (d.kind === 'debit') {
      const ics = checkIcs(b.ics);
      if (ics.status !== 'ok') add('error', `${label}${ics.message}`);
      if (!b.sequence) add('error', `${label}type de séquence (SeqTp) absent.`);
    }
    if (!/^\d{4}-\d{2}-\d{2}/.test(b.date)) add('error', `${label}date d’exécution absente ou mal formée.`);
  });

  let badIban = 0, badBic = 0, notLatin = 0, longName = 0, noRef = 0, badAmount = 0, otherCcy = 0;
  const seen = new Map<string, number>();
  for (const t of d.txs) {
    if (checkIban(t.iban).status !== 'ok') badIban++;
    if (t.bic && checkBic(t.bic, t.iban.slice(0, 2)).status === 'invalid') badBic++;
    if (![t.name, t.remittance, t.endToEndId].every(isSepaText)) notLatin++;
    if (t.name.length > 70) longName++;
    if (!t.endToEndId || t.endToEndId === 'NOTPROVIDED') noRef++;
    if (!Number.isFinite(t.cents) || t.cents <= 0) badAmount++;
    if (t.currency && t.currency !== 'EUR') otherCcy++;
    if (t.endToEndId && t.endToEndId !== 'NOTPROVIDED') seen.set(t.endToEndId, (seen.get(t.endToEndId) ?? 0) + 1);
  }
  if (badIban) add('error', `${badIban} opération(s) avec un IBAN invalide.`);
  if (badBic) add('warning', `${badBic} opération(s) avec un BIC incohérent avec l’IBAN.`);
  if (badAmount) add('error', `${badAmount} opération(s) avec un montant absent, nul ou mal formé.`);
  if (otherCcy) add('error', `${otherCcy} opération(s) dans une autre devise que l’euro : impossible en SEPA.`);
  if (notLatin) add('warning', `${notLatin} opération(s) contiennent des accents ou des caractères hors du jeu SEPA : certaines banques les refusent ou les remplacent.`);
  if (longName) add('warning', `${longName} nom(s) de plus de 70 caractères : ils seront tronqués.`);
  const dups = [...seen.values()].filter((n) => n > 1).length;
  if (dups) add('warning', `${dups} référence(s) de bout en bout utilisées plusieurs fois.`);
  if (noRef && noRef === d.txs.length) add('info', 'Aucune référence de bout en bout (NOTPROVIDED) : le rapprochement sera plus difficile.');
  if (!out.some((i) => i.level === 'error')) add('info', 'Structure cohérente : nombres d’opérations et totaux concordent.');
  return out;
}
