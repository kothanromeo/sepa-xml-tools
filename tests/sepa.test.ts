// @vitest-environment happy-dom
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAmount, xmlAmount } from '../src/lib/sepa/amount';
import { closedReason, nextBusinessDay, parseDate } from '../src/lib/sepa/dates';
import { buildEpc, epcMatrix, rfFrom, rfValid } from '../src/lib/sepa/epc';
import { checkIcs } from '../src/lib/sepa/ics';
import { composeCredit, composeDebit, type CreditHeader, type DebitHeader } from '../src/lib/sepa/compose';
import { guessMapping } from '../src/lib/sepa/rows';
import { readSepa, SepaReadError } from '../src/lib/sepa/read';
import { docXlsx, modelXlsx, SAMPLE_HEADER, sampleDebits, sampleTransfers } from '../src/lib/sepa/sample';
import { sepaId, sepaText } from '../src/lib/sepa/text';
import { readTable } from '../src/lib/table';

const NOW = new Date('2026-11-10T10:00:00');
mkdirSync('tests/out', { recursive: true });

describe('Texte SEPA', () => {
  it('retire accents et symboles', () => {
    expect(sepaText('Imprimerie Lefèvre & Fils', 70).text).toBe('Imprimerie Lefevre et Fils');
    expect(sepaText('Œuvre « Ça va » n°3', 70).text).toBe('OEuvre Ca va n 3');
    expect(sepaText('x'.repeat(80), 70)).toMatchObject({ truncated: true });
  });
  it('nettoie les identifiants', () => {
    expect(sepaId('/ABC//123/').text).toBe('ABC/123');
  });
});

describe('Montants', () => {
  it.each([
    ['1 250,00', 125000], ['1.234,56', 123456], ['1,234.56', 123456], ['342.90', 34290], ['4 600', 460000], ['0,5', 50], ['12 €', 1200],
  ])('%s', (raw, cents) => expect(parseAmount(raw).cents).toBe(cents));
  it('refuse les montants invalides', () => {
    for (const raw of ['-5', '0', 'abc', '12,345', '']) expect(parseAmount(raw).error).toBeTruthy();
    expect(xmlAmount(123456)).toBe('1234.56');
    expect(xmlAmount(5)).toBe('0.05');
  });
});

describe('ICS, RF, dates', () => {
  it('contrôle la clé de l’ICS (code activité exclu)', () => {
    expect(checkIcs('FR07ZZZ591778').status).toBe('ok');
    expect(checkIcs('FR07ABC591778').status).toBe('ok');
    expect(checkIcs('FR08ZZZ591778').status).toBe('invalid');
    expect(checkIcs('FR07ZZZ59177').status).toBe('format');
  });
  it('référence RF ISO 11649', () => {
    expect(rfValid('RF18 5390 0754 7034')).toBe(true);
    expect(rfValid('RF19539007547034')).toBe(false);
    expect(rfFrom('539007547034')).toBe('RF18539007547034');
  });
  it('calendrier TARGET', () => {
    expect(closedReason('2026-12-25')).toBe('Noël');
    expect(closedReason('2026-04-03')).toBe('Vendredi saint');
    expect(closedReason('2026-11-11')).toBeUndefined();
    expect(nextBusinessDay('2026-12-24', 1)).toBe('2026-12-28');
    expect(parseDate('05/09/2026')).toBe('2026-09-05');
    expect(parseDate('31/02/2026')).toBeUndefined();
    expect(parseDate('46000')).toBe('2025-12-09');
  });
});

describe('QR code EPC', () => {
  it('reproduit l’exemple de la norme (version 002)', () => {
    const r = buildEpc({ name: "François D'Alsace S.A.", iban: 'FR1420041010050500013M02606', amount: '12,3', text: 'Client:Marie Louise La Lune' });
    expect(r.errors).toEqual([]);
    expect(r.payload).toBe("BCD\n002\n1\nSCT\n\nFrançois D'Alsace S.A.\nFR1420041010050500013M02606\nEUR12.30\n\n\nClient:Marie Louise La Lune");
    const qr = epcMatrix(r.payload!);
    expect(qr.version).toBeLessThanOrEqual(13);
  });
  it('refuse référence et libellé ensemble, et les contenus trop longs', () => {
    expect(buildEpc({ name: 'A', iban: 'FR1420041010050500013M02606', reference: 'RF18539007547034', text: 'x' }).errors.length).toBe(1);
    expect(buildEpc({ name: 'A', iban: 'FR1420041010050500013M02606', text: 'é'.repeat(140), info: 'é'.repeat(70) }).errors[0]).toMatch(/octets/);
  });
});

const creditHeader: CreditHeader = {
  ...SAMPLE_HEADER.credit, executionDate: '2026-11-13', version: 'pain.001.001.09', instant: false, batchBooking: false, country: 'FR',
};
const debitHeader: DebitHeader = {
  ...SAMPLE_HEADER.debit, collectionDate: '2026-11-16', version: 'pain.008.001.08', scheme: 'CORE', batchBooking: true, country: 'FR',
};

describe('Virements (pain.001)', () => {
  const { headers, rows } = sampleTransfers();
  const m = guessMapping('credit', headers, rows);
  it('reconnaît les colonnes', () => {
    expect(m).toMatchObject({ name: 0, iban: 1, bic: 2, amount: 3, remittance: 4, reference: 5 });
  });
  it('génère les deux versions', () => {
    for (const version of ['pain.001.001.09', 'pain.001.001.03'] as const) {
      const r = composeCredit({ ...creditHeader, version, city: 'Lyon' }, rows, m, NOW);
      expect(r.errors).toBe(0);
      expect(r.count).toBe(7);
      expect(r.xml).toContain(`xsd:${version}`);
      writeFileSync(`tests/out/virements-${version}.xml`, r.xml!);
    }
    const inst = composeCredit({ ...creditHeader, instant: true }, rows, m, NOW);
    expect(inst.xml).toContain('<Cd>INST</Cd>');
    writeFileSync('tests/out/virements-instantanes.xml', inst.xml!);
  });
  it('signale RIB converti, nom modifié et adresse manquante', () => {
    const r = composeCredit(creditHeader, rows, m, NOW);
    expect(r.rows[3].issues.some((i) => /RIB converti/.test(i.message))).toBe(true);
    expect(r.rows[0].value?.name).toBe('Imprimerie Lefevre et Fils');
    expect(r.header.some((i) => /hors Espace économique européen/.test(i.message))).toBe(true);
    expect(r.xml).not.toContain('Lefèvre');
  });
  it('bloque sur une erreur', () => {
    const bad = rows.map((r) => [...r]);
    bad[1][1] = 'FR7630003012340005012345600';
    bad[2][3] = '-10';
    const r = composeCredit({ ...creditHeader, executionDate: '2026-11-01' }, bad, m, NOW);
    expect(r.xml).toBeUndefined();
    expect(r.errors).toBe(3);
  });
});

describe('Prélèvements (pain.008)', () => {
  const { headers, rows } = sampleDebits();
  const m = guessMapping('debit', headers, rows);
  it('reconnaît les colonnes', () => {
    expect(m).toMatchObject({ name: 0, iban: 1, amount: 2, mandateId: 3, mandateDate: 4, sequence: 5, remittance: 6 });
  });
  it('reconnaît des en-têtes moins classiques', () => {
    const h = ['Nom adhérent', 'Compte bancaire', 'Cotisation', 'Référence mandat', 'Signé le', 'Type'];
    expect(guessMapping('debit', h)).toMatchObject({ name: 0, iban: 1, amount: 2, mandateId: 3, mandateDate: 4, sequence: 5 });
  });
  it('génère les deux versions, un lot par séquence', () => {
    for (const version of ['pain.008.001.08', 'pain.008.001.02'] as const) {
      const r = composeDebit({ ...debitHeader, version }, rows, m, NOW);
      expect(r.header.filter((i) => i.level === 'error')).toEqual([]);
      expect(r.errors).toBe(0);
      expect(r.xml!.match(/<PmtInf>/g)!.length).toBe(3);
      writeFileSync(`tests/out/prelevements-${version}.xml`, r.xml!);
    }
  });
  it('refuse une échéance trop proche et un mandat postérieur', () => {
    const bad = rows.map((r) => [...r]);
    bad[0][4] = '20/11/2026';
    const r = composeDebit({ ...debitHeader, collectionDate: '2026-11-10' }, bad, m, NOW);
    expect(r.xml).toBeUndefined();
    expect(r.header.some((i) => /trop proche/.test(i.message))).toBe(true);
    const r2 = composeDebit(debitHeader, bad, m, NOW);
    expect(r2.rows[0].issues.some((i) => /signé après/.test(i.message))).toBe(true);
  });
});

describe('Lecture d’un fichier SEPA', () => {
  it('relit un fichier généré', () => {
    const { headers, rows } = sampleTransfers();
    const r = composeCredit(creditHeader, rows, guessMapping('credit', headers, rows), NOW);
    const d = readSepa(r.xml!);
    expect(d.kind).toBe('credit');
    expect(d.version).toBe('pain.001.001.09');
    expect(d.txs.length).toBe(7);
    expect(d.declaredSum).toBe(r.total);
    expect(d.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(docXlsx(d).length).toBeGreaterThan(1000);
  });
  it('détecte un total faux', () => {
    const { headers, rows } = sampleDebits();
    const r = composeDebit(debitHeader, rows, guessMapping('debit', headers, rows), NOW);
    const d = readSepa(r.xml!.replace(/<CtrlSum>[\d.]+<\/CtrlSum>/, '<CtrlSum>1.00</CtrlSum>'));
    expect(d.kind).toBe('debit');
    expect(d.issues.some((i) => i.level === 'error' && /total/.test(i.message))).toBe(true);
  });
  it('refuse un XML qui n’est pas une remise', () => {
    expect(() => readSepa('<Document><BkToCstmrStmt/></Document>')).toThrow(SepaReadError);
    expect(() => readSepa('<a>')).toThrow(SepaReadError);
  });
});

describe('Modèle Excel', () => {
  it('se relit avec les bonnes colonnes', () => {
    for (const kind of ['credit', 'debit'] as const) {
      const t = readTable(modelXlsx(kind), 'modele.xlsx');
      const m = guessMapping(kind, t.headers, t.rows);
      expect(m.name).toBe(0);
      expect(m.iban).toBe(1);
      if (kind === 'debit') expect(m).toMatchObject({ mandateId: 4, mandateDate: 5, sequence: 6 });
    }
  });
});
