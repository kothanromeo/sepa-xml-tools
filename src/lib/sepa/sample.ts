import { ribKey, ribToIban } from '../iban';
import { writeXlsx } from '../xlsx';
import { FIELD_LABELS, type Field, type Kind } from './rows';
import { icsKey } from './ics';
import { euros } from './amount';
import { frDate } from './dates';
import type { SepaDoc } from './read';

/* Données fictives de démonstration, modèle Excel à remplir, export d'un fichier lu. */

const iban = (bank: string, branch: string, account: string) => ribToIban(bank, branch, account, ribKey(bank, branch, account));

export const SAMPLE_HEADER = {
  credit: { name: 'Atelier Démo SARL', iban: iban('30004', '00823', '00010987654'), bic: '' },
  debit: { name: 'Association Vélo Démo', iban: iban('20041', '01005', '0123456Z022'), bic: '', ics: `FR${icsKey('FR', '9D3M0X')}ZZZ9D3M0X` },
};

/** Virements fictifs : un cas par situation courante (accent, RIB, hors EEE…). */
export function sampleTransfers(): { headers: string[]; rows: string[][] } {
  return {
    headers: ['Bénéficiaire', 'IBAN', 'BIC', 'Montant', 'Libellé', 'Référence'],
    rows: [
      ['Imprimerie Lefèvre & Fils', iban('10278', '06039', '00020517801'), '', '1 250,00', 'Facture F-2026-118', 'F-2026-118'],
      ['Café des Arts', iban('30003', '01234', '00050123456'), 'SOGEFRPP', '86,40', 'Facture 2026/0457', '2026-0457'],
      ['Marie Dupont', iban('20041', '01005', '0500013M026'), '', '1 980,55', 'Salaire novembre 2026', 'SAL-2026-11-001'],
      ['Garage Martin', '10278 06039 00020517800 ' + ribKey('10278', '06039', '00020517800'), '', '342.90', 'Réparation véhicule', 'GM-8812'],
      ['Müller Logistik GmbH', 'DE89370400440532013000', 'COBADEFFXXX', '4 600', 'Rechnung 2026-77', 'RE-2026-77'],
      ['Brasserie Bruxelloise', 'BE68539007547034', '', '312,00', 'Commande 5521', ''],
      ['Studio Helvetica', 'CH9300762011623852957', 'POFICHBEXXX', '780,00', 'Projet logo', 'HV-2026-03'],
    ],
  };
}

export function sampleDebits(): { headers: string[]; rows: string[][] } {
  return {
    headers: ['Adhérent', 'IBAN', 'Montant', 'RUM', 'Date de signature', 'Séquence', 'Libellé'],
    rows: [
      ['Paul Bernard', iban('30004', '00823', '00010111222'), '35,00', 'ADH-2026-0001', '05/09/2026', 'RCUR', 'Cotisation novembre 2026'],
      ['Léa Rousseau', iban('10278', '06039', '00020333444'), '35,00', 'ADH-2026-0002', '07/09/2026', 'RCUR', 'Cotisation novembre 2026'],
      ['Hugo Lambert', iban('20041', '01005', '0555666A027'), '35,00', 'ADH-2026-0031', '02/11/2026', 'FRST', 'Cotisation novembre 2026'],
      ['Chloé Petit', iban('30003', '01234', '00050777888'), '120,00', 'ADH-2026-0032', '03/11/2026', 'OOFF', 'Licence annuelle 2026-2027'],
    ],
  };
}

const MODEL: Record<Kind, { fields: Field[]; examples: string[][] }> = {
  credit: {
    fields: ['name', 'iban', 'bic', 'amount', 'remittance', 'reference'],
    examples: [
      ['Fournisseur Exemple', 'FR76 3000 6000 0112 3456 7890 189', '', '1250,00', 'Facture F-2026-118', 'F-2026-118'],
      ['Jeanne Exemple', 'FR14 2004 1010 0505 0001 3M02 606', '', '1980,55', 'Salaire novembre 2026', 'SAL-2026-11-001'],
    ],
  },
  debit: {
    fields: ['name', 'iban', 'bic', 'amount', 'mandateId', 'mandateDate', 'sequence', 'remittance', 'reference'],
    examples: [
      ['Client Exemple', 'FR76 3000 6000 0112 3456 7890 189', '', '35,00', 'MANDAT-0001', '05/09/2026', 'RCUR', 'Abonnement novembre 2026', 'ABO-2026-11-0001'],
    ],
  },
};

/** Modèle Excel vide à remplir (colonnes reconnues automatiquement à l'import). */
export function modelXlsx(kind: Kind): Uint8Array {
  const { fields, examples } = MODEL[kind];
  return writeXlsx([{
    name: kind === 'credit' ? 'Virements' : 'Prélèvements',
    header: fields.map((f) => FIELD_LABELS[f]),
    widths: fields.map((f) => (f === 'iban' ? 36 : f === 'remittance' ? 34 : f === 'name' ? 28 : 16)),
    rows: examples,
  }], kind === 'credit' ? 'Modèle de virements SEPA' : 'Modèle de prélèvements SEPA');
}

/** Export d'un fichier SEPA lu : opérations et lots. */
export function docXlsx(d: SepaDoc): Uint8Array {
  const debit = d.kind === 'debit';
  return writeXlsx([
    {
      name: debit ? 'Prélèvements' : 'Virements',
      header: ['Lot', debit ? 'Débiteur' : 'Bénéficiaire', 'IBAN', 'BIC', 'Montant', 'Référence', 'Libellé', ...(debit ? ['RUM', 'Date du mandat', 'Séquence'] : []), 'Date'],
      widths: [8, 30, 34, 13, 14, 24, 40, ...(debit ? [22, 14, 10] : []), 12],
      amountCols: [4],
      rows: d.txs.map((t) => {
        const b = d.batches[t.batch];
        return [
          t.batch + 1, t.name, t.iban, t.bic || undefined, Number.isFinite(t.cents) ? t.cents / 100 : undefined, t.endToEndId, t.remittance || undefined,
          ...(debit ? [t.mandateId, t.mandateDate ? { date: t.mandateDate } : undefined, b.sequence] : []),
          /^\d{4}-\d{2}-\d{2}/.test(b.date) ? { date: b.date.slice(0, 10) } : b.date,
        ];
      }),
    },
    {
      name: 'Lots',
      header: ['Lot', 'Identifiant', 'Date', debit ? 'Créancier' : 'Donneur d’ordre', 'IBAN', 'BIC', ...(debit ? ['ICS', 'Séquence', 'Type'] : ['Instantané']), 'Opérations', 'Total'],
      widths: [6, 30, 12, 30, 34, 13, ...(debit ? [16, 10, 8] : [11]), 11, 14],
      amountCols: [debit ? 10 : 8],
      rows: d.batches.map((b, i) => [
        i + 1, b.id, /^\d{4}-\d{2}-\d{2}/.test(b.date) ? { date: b.date.slice(0, 10) } : b.date, b.name, b.iban, b.bic || undefined,
        ...(debit ? [b.ics, b.sequence, b.scheme] : [b.instant ? 'Oui' : 'Non']), b.count, b.sum / 100,
      ]),
    },
  ], `Fichier SEPA ${d.msgId}`);
}

/** Résumé texte d'un lot, pour l'affichage. */
export const batchLabel = (d: SepaDoc, i: number) => {
  const b = d.batches[i];
  return `${b.count} opération(s), ${euros(b.sum)}, ${d.kind === 'debit' ? 'prélevées' : 'exécutées'} le ${frDate(b.date.slice(0, 10))}`;
};
