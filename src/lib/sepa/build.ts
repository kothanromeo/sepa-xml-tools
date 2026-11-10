import { xmlAmount } from './amount';
import { xml } from './text';

/*
 * Génération des messages ISO 20022 de remise d'ordres :
 *   - virements SEPA : pain.001.001.09 (version 2019, recommandée) ou pain.001.001.03 (version 2009) ;
 *   - prélèvements SEPA : pain.008.001.08 (2019) ou pain.008.001.02 (2009).
 * Les données reçues ici sont déjà contrôlées et converties au jeu de caractères SEPA (voir rows.ts).
 */

export type CreditVersion = 'pain.001.001.09' | 'pain.001.001.03';
export type DebitVersion = 'pain.008.001.08' | 'pain.008.001.02';
export type Sequence = 'FRST' | 'RCUR' | 'OOFF' | 'FNAL';

export interface Address {
  street?: string;
  postcode?: string;
  city: string;
  /** Code pays ISO à 2 lettres. */
  country: string;
}

export interface Account {
  name: string;
  iban: string;
  bic?: string;
  address?: Address;
}

export interface Transfer extends Account {
  cents: number;
  /** Référence de bout en bout (EndToEndId), 35 caractères ; « NOTPROVIDED » si vide. */
  endToEndId: string;
  /** Libellé transmis au bénéficiaire (140 caractères). */
  remittance?: string;
}

export interface CreditFile {
  version: CreditVersion;
  msgId: string;
  /** Date et heure de création, AAAA-MM-JJTHH:MM:SS. */
  createdAt: string;
  debtor: Account;
  executionDate: string;
  instant: boolean;
  batchBooking: boolean;
  transfers: Transfer[];
}

export interface Debit extends Account {
  cents: number;
  endToEndId: string;
  remittance?: string;
  mandateId: string;
  mandateDate: string;
  sequence: Sequence;
}

export interface DebitFile {
  version: DebitVersion;
  msgId: string;
  createdAt: string;
  creditor: Account;
  ics: string;
  collectionDate: string;
  scheme: 'CORE' | 'B2B';
  batchBooking: boolean;
  debits: Debit[];
}

export const NAMESPACES: Record<CreditVersion | DebitVersion, string> = {
  'pain.001.001.09': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.09',
  'pain.001.001.03': 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
  'pain.008.001.08': 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.08',
  'pain.008.001.02': 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.02',
};

const sum = (items: { cents: number }[]) => items.reduce((s, t) => s + t.cents, 0);
const el = (tag: string, value: string | undefined, indent: string) => (value ? `${indent}<${tag}>${xml(value)}</${tag}>\n` : '');

function address(a: Address | undefined, indent: string): string {
  if (!a?.city || !a.country) return '';
  return `${indent}<PstlAdr>\n${el('StrtNm', a.street, indent + '  ')}${el('PstCd', a.postcode, indent + '  ')}${el('TwnNm', a.city, indent + '  ')}${el('Ctry', a.country, indent + '  ')}${indent}</PstlAdr>\n`;
}

function party(tag: string, a: Account, indent: string): string {
  return `${indent}<${tag}>\n${el('Nm', a.name, indent + '  ')}${address(a.address, indent + '  ')}${indent}</${tag}>\n`;
}

function iban(tag: string, value: string, indent: string): string {
  return `${indent}<${tag}>\n${indent}  <Id>\n${indent}    <IBAN>${value}</IBAN>\n${indent}  </Id>\n${indent}</${tag}>\n`;
}

/** Agent (banque) : BIC si connu ; sinon « NOTPROVIDED » si l'élément est obligatoire, rien s'il est facultatif. */
function agent(tag: string, bic: string | undefined, modern: boolean, mandatory: boolean, indent: string): string {
  if (!bic && !mandatory) return '';
  const id = bic
    ? `${indent}    <${modern ? 'BICFI' : 'BIC'}>${bic}</${modern ? 'BICFI' : 'BIC'}>\n`
    : `${indent}    <Othr>\n${indent}      <Id>NOTPROVIDED</Id>\n${indent}    </Othr>\n`;
  return `${indent}<${tag}>\n${indent}  <FinInstnId>\n${id}${indent}  </FinInstnId>\n${indent}</${tag}>\n`;
}

function header(msgId: string, createdAt: string, count: number, total: number, initiator: string): string {
  return `    <GrpHdr>
      <MsgId>${xml(msgId)}</MsgId>
      <CreDtTm>${createdAt}</CreDtTm>
      <NbOfTxs>${count}</NbOfTxs>
      <CtrlSum>${xmlAmount(total)}</CtrlSum>
      <InitgPty>
        <Nm>${xml(initiator)}</Nm>
      </InitgPty>
    </GrpHdr>
`;
}

const open = (version: string, root: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<Document xmlns="${NAMESPACES[version as CreditVersion]}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <${root}>\n`;

export function buildCreditTransfer(f: CreditFile): string {
  const modern = f.version === 'pain.001.001.09';
  const total = sum(f.transfers);
  const i = '      ';
  let out = open(f.version, 'CstmrCdtTrfInitn') + header(f.msgId, f.createdAt, f.transfers.length, total, f.debtor.name);
  out += `    <PmtInf>
      <PmtInfId>${xml(f.msgId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>${f.batchBooking}</BtchBookg>
      <NbOfTxs>${f.transfers.length}</NbOfTxs>
      <CtrlSum>${xmlAmount(total)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
${f.instant ? '        <LclInstrm>\n          <Cd>INST</Cd>\n        </LclInstrm>\n' : ''}      </PmtTpInf>
${modern ? `      <ReqdExctnDt>\n        <Dt>${f.executionDate}</Dt>\n      </ReqdExctnDt>\n` : `      <ReqdExctnDt>${f.executionDate}</ReqdExctnDt>\n`}`;
  out += party('Dbtr', f.debtor, i) + iban('DbtrAcct', f.debtor.iban, i) + agent('DbtrAgt', f.debtor.bic, modern, true, i);
  out += `${i}<ChrgBr>SLEV</ChrgBr>\n`;
  const t = i + '  ';
  for (const tx of f.transfers) {
    out += `${i}<CdtTrfTxInf>
${t}<PmtId>
${t}  <EndToEndId>${xml(tx.endToEndId)}</EndToEndId>
${t}</PmtId>
${t}<Amt>
${t}  <InstdAmt Ccy="EUR">${xmlAmount(tx.cents)}</InstdAmt>
${t}</Amt>
`;
    out += agent('CdtrAgt', tx.bic, modern, false, t) + party('Cdtr', tx, t) + iban('CdtrAcct', tx.iban, t);
    if (tx.remittance) out += `${t}<RmtInf>\n${t}  <Ustrd>${xml(tx.remittance)}</Ustrd>\n${t}</RmtInf>\n`;
    out += `${i}</CdtTrfTxInf>\n`;
  }
  return out + '    </PmtInf>\n  </CstmrCdtTrfInitn>\n</Document>\n';
}

/** Ordre des séquences dans le fichier. */
const SEQUENCES: Sequence[] = ['FRST', 'RCUR', 'OOFF', 'FNAL'];

export function buildDirectDebit(f: DebitFile): string {
  const modern = f.version === 'pain.008.001.08';
  const total = sum(f.debits);
  const i = '      ';
  let out = open(f.version, 'CstmrDrctDbtInitn') + header(f.msgId, f.createdAt, f.debits.length, total, f.creditor.name);
  // Le type de séquence se déclare au niveau du lot (PmtInf) : un lot par séquence présente.
  for (const seq of SEQUENCES) {
    const debits = f.debits.filter((d) => d.sequence === seq);
    if (!debits.length) continue;
    out += `    <PmtInf>
      <PmtInfId>${xml(`${f.msgId}-${seq}`.slice(0, 35))}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>${f.batchBooking}</BtchBookg>
      <NbOfTxs>${debits.length}</NbOfTxs>
      <CtrlSum>${xmlAmount(sum(debits))}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>${f.scheme}</Cd>
        </LclInstrm>
        <SeqTp>${seq}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${f.collectionDate}</ReqdColltnDt>
`;
    out += party('Cdtr', f.creditor, i) + iban('CdtrAcct', f.creditor.iban, i) + agent('CdtrAgt', f.creditor.bic, modern, true, i);
    out += `${i}<ChrgBr>SLEV</ChrgBr>
${i}<CdtrSchmeId>
${i}  <Id>
${i}    <PrvtId>
${i}      <Othr>
${i}        <Id>${f.ics}</Id>
${i}        <SchmeNm>
${i}          <Prtry>SEPA</Prtry>
${i}        </SchmeNm>
${i}      </Othr>
${i}    </PrvtId>
${i}  </Id>
${i}</CdtrSchmeId>
`;
    const t = i + '  ';
    for (const d of debits) {
      out += `${i}<DrctDbtTxInf>
${t}<PmtId>
${t}  <EndToEndId>${xml(d.endToEndId)}</EndToEndId>
${t}</PmtId>
${t}<InstdAmt Ccy="EUR">${xmlAmount(d.cents)}</InstdAmt>
${t}<DrctDbtTx>
${t}  <MndtRltdInf>
${t}    <MndtId>${xml(d.mandateId)}</MndtId>
${t}    <DtOfSgntr>${d.mandateDate}</DtOfSgntr>
${t}  </MndtRltdInf>
${t}</DrctDbtTx>
`;
      out += agent('DbtrAgt', d.bic, modern, true, t) + party('Dbtr', d, t) + iban('DbtrAcct', d.iban, t);
      if (d.remittance) out += `${t}<RmtInf>\n${t}  <Ustrd>${xml(d.remittance)}</Ustrd>\n${t}</RmtInf>\n`;
      out += `${i}</DrctDbtTxInf>\n`;
    }
    out += '    </PmtInf>\n';
  }
  return out + '  </CstmrDrctDbtInitn>\n</Document>\n';
}

/** Identifiant de message unique : préfixe + date et heure + aléa, 35 caractères au plus. */
export function messageId(prefix: string, now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${stamp}-${rand}`.slice(0, 35);
}

/** Date et heure locales au format ISO sans fuseau ni millisecondes. */
export function localDateTime(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}
