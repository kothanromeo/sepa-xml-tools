import { euros } from '../lib/sepa/amount';
import { frDate } from '../lib/sepa/dates';
import { readSepa, type SepaDoc } from '../lib/sepa/read';
import { bindThanks, thanksCard, waitCard } from './creator';
import { bindDrop, download, esc, issueList, XLSX_TYPE } from './ui';

const MAX_ROWS = 500;

const fmtDate = (s: string) => (/^\d{4}-\d{2}-\d{2}/.test(s) ? frDate(s.slice(0, 10)) + (s.length > 10 ? ' ' + s.slice(11, 16) : '') : esc(s));

function render(d: SepaDoc, fileName: string): string {
  const debit = d.kind === 'debit';
  const total = d.txs.reduce((s, t) => s + (Number.isFinite(t.cents) ? t.cents : 0), 0);
  const errors = d.issues.filter((i) => i.level === 'error').length;
  const banner = errors
    ? `<div class="banner err"><div><strong>${errors} problème(s) bloquant(s)</strong><p>La banque risque de refuser ce fichier. Le détail est ci-dessous.</p></div></div>`
    : `<div class="banner ok"><div><strong>Fichier lisible et cohérent</strong><p>${debit ? 'Remise de prélèvements' : 'Remise de virements'} ${esc(d.version || '')}.</p></div></div>`;
  const batches = d.batches.map((b, i) => `<div class="card acct">
    <div class="acct-head"><strong>${d.batches.length > 1 ? `Lot ${i + 1} · ` : ''}${esc(b.name || '—')}</strong><span class="mono">${esc(b.iban)}</span>${b.bic ? `<span class="mono">${esc(b.bic)}</span>` : ''}</div>
    <dl class="acct-kv">
      <div><dt>${debit ? 'Échéance' : 'Exécution'}</dt><dd>${fmtDate(b.date)}</dd></div>
      <div><dt>Opérations</dt><dd>${b.count}</dd></div>
      <div><dt>Total</dt><dd>${euros(b.sum)}</dd></div>
      ${debit ? `<div><dt>Séquence · type</dt><dd>${esc(b.sequence ?? '—')} · ${esc(b.scheme ?? '—')}</dd></div><div><dt>ICS</dt><dd class="mono">${esc(b.ics ?? '—')}</dd></div>` : `<div><dt>Instantané</dt><dd>${b.instant ? 'Oui' : 'Non'}</dd></div>`}
    </dl></div>`).join('');
  const rows = d.txs.slice(0, MAX_ROWS).map((t, i) => `<tr>
    <td class="num">${i + 1}</td><td>${esc(t.name)}</td><td class="mono">${esc(t.iban)}</td><td class="mono">${esc(t.bic)}</td>
    <td class="num">${Number.isFinite(t.cents) ? euros(t.cents) : '<span class="neg">?</span>'}</td>
    <td class="mono">${esc(t.endToEndId)}</td><td>${esc(t.remittance)}</td>
    ${debit ? `<td class="mono">${esc(t.mandateId)}</td><td>${t.mandateDate ? fmtDate(t.mandateDate) : ''}</td>` : ''}</tr>`).join('');
  return `${banner}
    <div class="stats">
      <div class="stat"><span class="stat-label">Opérations</span><strong>${d.txs.length}</strong></div>
      <div class="stat"><span class="stat-label">Total</span><strong>${euros(total)}</strong></div>
      <div class="stat"><span class="stat-label">Créé le</span><strong>${fmtDate(d.createdAt)}</strong><span class="stat-sub">${esc(d.initiator)}</span></div>
      <div class="stat"><span class="stat-label">Identifiant</span><strong class="mono" style="font-size:0.85rem">${esc(d.msgId)}</strong></div>
    </div>
    <div class="export-bar"><span class="export-title">Exporter :</span><button type="button" class="btn" data-xlsx>Excel (.xlsx)</button></div>
    ${thanksCard('analyse')}
    <h3>Contrôles</h3>${issueList(d.issues)}
    <h3>${d.batches.length > 1 ? `${d.batches.length} lots` : 'Le lot'}</h3>${batches}
    <h3>${debit ? 'Prélèvements' : 'Virements'}</h3>
    <div class="table-wrap"><table class="ops"><thead><tr><th class="num">#</th><th>${debit ? 'Débiteur' : 'Bénéficiaire'}</th><th>IBAN</th><th>BIC</th><th class="num">Montant</th><th>Référence</th><th>Libellé</th>${debit ? '<th>RUM</th><th>Mandat</th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div>
    ${d.txs.length > MAX_ROWS ? `<p class="hint">Affichage limité aux ${MAX_ROWS} premières opérations sur ${d.txs.length}. L’export Excel contient tout.</p>` : ''}
    <div class="btn-row"><button type="button" class="btn ghost" data-reset>Lire un autre fichier</button></div>
    <p class="hint">Fichier : ${esc(fileName)}</p>`;
}

export function mountReader(root: HTMLElement) {
  const drop = root.querySelector<HTMLElement>('[data-drop]')!;
  const out = root.querySelector<HTMLElement>('[data-result]')!;

  const show = (source: string, fileName: string) => {
    out.hidden = false;
    out.innerHTML = waitCard('Lecture du fichier…');
    setTimeout(() => {
      try {
        const d = readSepa(source);
        out.innerHTML = render(d, fileName);
        bindThanks(out);
        out.querySelector('[data-xlsx]')!.addEventListener('click', async () => {
          const { docXlsx } = await import('../lib/sepa/sample');
          download(docXlsx(d), fileName.replace(/\.[^.]+$/, '') + '.xlsx', XLSX_TYPE);
        });
        out.querySelector('[data-reset]')!.addEventListener('click', () => {
          out.hidden = true;
          drop.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      } catch (e) {
        out.innerHTML = `<div class="banner err"><div><strong>Lecture impossible</strong><p>${esc(e instanceof Error ? e.message : e)}</p></div></div>`;
      }
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 20);
  };

  bindDrop(drop, root.querySelector('[data-file]')!, async (file) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Les remises sont en UTF-8 ; on se rabat sur Latin-1 si le fichier ne l'est pas.
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('iso-8859-1').decode(bytes);
    }
    show(text.replace(/^﻿/, ''), file.name);
  });

  root.querySelector('[data-sample]')!.addEventListener('click', async () => {
    const [{ composeDebit }, s, { guessMapping }, { nextBusinessDay, today }] = await Promise.all([
      import('../lib/sepa/compose'), import('../lib/sepa/sample'), import('../lib/sepa/rows'), import('../lib/sepa/dates'),
    ]);
    const { headers, rows } = s.sampleDebits();
    const c = composeDebit({
      ...s.SAMPLE_HEADER.debit, collectionDate: nextBusinessDay(today(), 3), version: 'pain.008.001.08', scheme: 'CORE', batchBooking: true,
    }, rows, guessMapping('debit', headers, rows));
    show(c.xml ?? '', 'exemple-prelevements.xml');
  });
}
