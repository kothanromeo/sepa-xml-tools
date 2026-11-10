import { euros } from '../lib/sepa/amount';
import { composeCredit, composeDebit, type Composed, type CreditHeader, type DebitHeader } from '../lib/sepa/compose';
import { frDate, nextBusinessDay, today } from '../lib/sepa/dates';
import { FIELD_LABELS, FIELDS, GRID_FIELDS, guessMapping, type Field, type Issue, type Kind, type Mapping } from '../lib/sepa/rows';
import { readTable, type Table } from '../lib/table';
import { bindThanks, thanksCard } from './creator';
import { bindDrop, download, esc, ICON, issueList, XLSX_TYPE } from './ui';

/*
 * Générateur de virements ou de prélèvements.
 * Les lignes sont tenues dans un tableau interne aux colonnes fixes (FIELDS[kind]) :
 * un fichier importé y est recopié selon le choix des colonnes, puis tout s'édite dans la grille.
 */

const MAX_GRID = 2000;

interface State {
  kind: Kind;
  rows: string[][];
  /** Colonnes visibles dans la grille. */
  visible: Field[];
  last?: Composed<{ cents: number; endToEndId: string }>;
}

const identity = (kind: Kind): Mapping => Object.fromEntries(FIELDS[kind].map((f, i) => [f, i]));

function mappingHtml(kind: Kind, table: Table, m: Mapping): string {
  const opts = (f: Field) =>
    `<option value="">— aucune —</option>` +
    table.headers.map((h, i) => `<option value="${i}" ${m[f] === i ? 'selected' : ''}>${esc(h || `Colonne ${i + 1}`)}</option>`).join('');
  const required: Field[] = kind === 'credit' ? ['name', 'iban', 'amount'] : ['name', 'iban', 'amount', 'mandateId', 'mandateDate'];
  return `<div class="card" style="margin-top:1rem">
    <h3 style="margin-top:0">Colonnes de votre fichier</h3>
    <p class="hint" style="margin-top:0">${table.rows.length} ligne(s) lue(s)${table.separator ? ` (CSV, séparateur « ${esc(table.separator)} »)` : table.sheet ? ` (feuille « ${esc(table.sheet)} »)` : ''}. Vérifiez la correspondance, puis validez.</p>
    <div class="fields">${FIELDS[kind]
      .map((f) => `<div><label>${FIELD_LABELS[f]}${required.includes(f) ? '' : ' <span class="hint">(facultatif)</span>'}</label><select data-map="${f}">${opts(f)}</select></div>`)
      .join('')}</div>
    <div class="btn-row" style="margin-top:1rem"><button type="button" class="btn" data-apply>Valider ces colonnes</button><button type="button" class="btn ghost" data-cancel>Annuler</button></div>
  </div>`;
}

const INPUT_CLASS: Partial<Record<Field, string>> = { iban: 'w-iban mono-input', bic: 'w-bic mono-input', amount: 'w-amount', mandateDate: 'w-date', sequence: 'w-seq', mandateId: 'w-rum mono-input', name: 'w-name' };

function gridHtml(st: State): string {
  const fields = st.visible;
  const head = `<tr><th class="num">#</th>${fields.map((f) => `<th>${FIELD_LABELS[f]}</th>`).join('')}<th>Contrôle</th><th><span class="sr-only">Supprimer</span></th></tr>`;
  const body = st.rows.slice(0, MAX_GRID).map((r, i) => `<tr data-row="${i}"><td class="num">${i + 1}</td>${fields
    .map((f) => {
      const col = FIELDS[st.kind].indexOf(f);
      const v = r[col] ?? '';
      if (f === 'sequence') {
        const seq = v || 'RCUR';
        return `<td><select data-r="${i}" data-c="${col}" class="${INPUT_CLASS[f]}" aria-label="${FIELD_LABELS[f]}, ligne ${i + 1}">${['FRST', 'RCUR', 'OOFF', 'FNAL'].map((s) => `<option ${s === seq ? 'selected' : ''}>${s}</option>`).join('')}${['FRST', 'RCUR', 'OOFF', 'FNAL'].includes(seq) ? '' : `<option selected>${esc(seq)}</option>`}</select></td>`;
      }
      return `<td><input data-r="${i}" data-c="${col}" value="${esc(v)}" class="${INPUT_CLASS[f] ?? ''}" aria-label="${FIELD_LABELS[f]}, ligne ${i + 1}" spellcheck="false" /></td>`;
    })
    .join('')}<td class="status" data-status="${i}"></td><td><button type="button" class="remove" data-del="${i}" title="Supprimer la ligne" aria-label="Supprimer la ligne ${i + 1}">×</button></td></tr>`).join('');
  return `<div class="table-wrap grid-wrap" style="margin-top:1rem"><table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    ${st.rows.length > MAX_GRID ? `<p class="hint">Seules les ${MAX_GRID} premières lignes sont modifiables ici ; toutes sont incluses dans le fichier.</p>` : ''}
    <div class="btn-row"><button type="button" class="btn ghost" data-add>+ Ajouter une ligne</button><button type="button" class="btn ghost" data-clear>Tout effacer</button></div>`;
}

function statusHtml(issues: Issue[]): string {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const infos = issues.filter((i) => i.level === 'info');
  const level = errors.length ? 'error' : warnings.length ? 'warning' : 'ok';
  const title = infos.map((i) => i.message).join('\n');
  const msgs = [...errors, ...warnings].map((i) => `<div class="${i.level}">${esc(i.message)}</div>`).join('');
  return `<span class="badge ${level === 'error' ? 'err' : level === 'warning' ? 'warn' : 'ok'}" title="${esc(title)}">${ICON[level]}</span>${msgs ? `<div class="row-msgs">${msgs}</div>` : infos.length ? `<div class="row-msgs info">${esc(infos[0].message)}</div>` : ''}`;
}

export function mountGenerator(root: HTMLElement) {
  const kind = root.dataset.gen as Kind;
  const credit = kind === 'credit';
  const h = (k: string) => root.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-h="${k}"]`)!;
  const lines = root.querySelector<HTMLElement>('[data-lines]')!;
  const summary = root.querySelector<HTMLElement>('[data-summary]')!;
  const result = root.querySelector<HTMLElement>('[data-result]')!;
  const hissues = root.querySelector<HTMLElement>('[data-hissues]')!;
  const st: State = { kind, rows: [], visible: GRID_FIELDS[kind] };

  h('date').value = credit ? nextBusinessDay(today()) : nextBusinessDay(today(), 2);
  h('date').min = today();

  const readHeader = () => {
    const common = {
      name: h('name').value, iban: h('iban').value, bic: h('bic').value,
      street: h('street').value, postcode: h('postcode').value, city: h('city').value, country: h('country').value,
      batchBooking: h('batch').checked,
    };
    return credit
      ? ({ ...common, executionDate: h('date').value, version: h('version').value, instant: h('instant').checked } as CreditHeader)
      : ({ ...common, ics: h('ics').value, collectionDate: h('date').value, version: h('version').value, scheme: h('scheme').value } as DebitHeader);
  };

  const compose = () => {
    const header = readHeader();
    const m = identity(kind);
    return credit ? composeCredit(header as CreditHeader, st.rows, m) : composeDebit(header as DebitHeader, st.rows, m);
  };

  const refresh = () => {
    if (!st.rows.length) {
      summary.hidden = true;
      hissues.innerHTML = '';
      return;
    }
    const c = compose();
    st.last = c;
    const byIndex = new Map(c.rows.map((r) => [r.index, r]));
    lines.querySelectorAll<HTMLElement>('[data-status]').forEach((cell) => {
      const i = Number(cell.dataset.status);
      const r = byIndex.get(i);
      cell.innerHTML = r ? statusHtml(r.issues) : '<span class="hint">vide</span>';
      cell.closest('tr')!.className = r?.issues.some((x) => x.level === 'error') ? 'row-err' : r?.issues.some((x) => x.level === 'warning') ? 'row-warn' : '';
    });
    const label = credit ? 'virement' : 'prélèvement';
    const ready = !c.errors;
    summary.hidden = false;
    summary.innerHTML = `<div class="t"><strong>${c.count} ${label}${c.count > 1 ? 's' : ''}</strong> · total <strong>${euros(c.total)}</strong>${
      c.errors ? ` · <span class="neg">${c.errors} erreur${c.errors > 1 ? 's' : ''} à corriger</span>` : ''}${c.warnings ? ` · <span class="warn-t">${c.warnings} avertissement${c.warnings > 1 ? 's' : ''}</span>` : ''}</div>
      <button type="button" class="btn" data-generate ${ready ? '' : 'disabled'}>Générer le fichier XML</button>
      ${c.header.some((i) => i.level === 'error') ? '<p class="hint" style="flex-basis:100%;margin:0">Voir les points à corriger sous « 1. ».</p>' : ''}`;
    hissues.innerHTML = issueList(c.header);
    summary.querySelector('[data-generate]')!.addEventListener('click', generate);
  };

  let timer: number | undefined;
  const refreshSoon = () => {
    clearTimeout(timer);
    timer = window.setTimeout(refresh, 200);
  };

  const renderGrid = () => {
    // Colonnes facultatives affichées dès qu'elles contiennent une valeur (adresse, référence…).
    const extra = FIELDS[kind].filter((f, col) => !GRID_FIELDS[kind].includes(f) && st.rows.some((r) => (r[col] ?? '').trim()));
    st.visible = [...GRID_FIELDS[kind], ...extra];
    lines.innerHTML = gridHtml(st);
    lines.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-r]').forEach((el) =>
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        st.rows[Number(el.dataset.r)][Number(el.dataset.c)] = el.value;
        result.hidden = true;
        refreshSoon();
      }),
    );
    lines.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) =>
      b.addEventListener('click', () => {
        st.rows.splice(Number(b.dataset.del), 1);
        renderGrid();
      }),
    );
    lines.querySelector('[data-add]')!.addEventListener('click', () => {
      st.rows.push(FIELDS[kind].map(() => ''));
      renderGrid();
      lines.querySelector<HTMLInputElement>(`[data-r="${st.rows.length - 1}"]`)?.focus();
    });
    lines.querySelector('[data-clear]')!.addEventListener('click', () => {
      if (!confirm('Effacer toutes les lignes ?')) return;
      st.rows = [];
      lines.innerHTML = '';
      summary.hidden = true;
      result.hidden = true;
    });
    refresh();
  };

  const load = (table: Table, m: Mapping) => {
    st.rows = table.rows
      .filter((r) => r.some((c) => String(c ?? '').trim()))
      .map((r) => FIELDS[kind].map((f) => (m[f] === undefined ? '' : String(r[m[f]!] ?? '').trim())));
    result.hidden = true;
    renderGrid();
  };

  const showMapping = (table: Table) => {
    if (!table.rows.length) throw new Error('Le fichier ne contient aucune ligne sous l’en-tête.');
    const m = guessMapping(kind, table.headers, table.rows);
    lines.innerHTML = mappingHtml(kind, table, m);
    lines.scrollIntoView({ behavior: 'smooth', block: 'start' });
    lines.querySelector('[data-apply]')!.addEventListener('click', () => {
      const chosen: Mapping = {};
      lines.querySelectorAll<HTMLSelectElement>('[data-map]').forEach((s) => {
        if (s.value !== '') chosen[s.dataset.map as Field] = Number(s.value);
      });
      load(table, chosen);
    });
    lines.querySelector('[data-cancel]')!.addEventListener('click', () => (lines.innerHTML = ''));
  };

  const showError = (e: unknown) => {
    lines.innerHTML = `<div class="banner err" style="margin-top:1rem"><div><strong>Lecture impossible</strong><p>${esc(e instanceof Error ? e.message : e)}</p></div></div>`;
  };

  bindDrop(root.querySelector('[data-drop]')!, root.querySelector('[data-file]')!, async (file) => {
    try {
      showMapping(readTable(new Uint8Array(await file.arrayBuffer()), file.name));
    } catch (e) {
      showError(e);
    }
  });

  root.querySelector('[data-manual]')!.addEventListener('click', () => {
    if (!st.rows.length) st.rows = [0, 1, 2].map(() => FIELDS[kind].map(() => ''));
    renderGrid();
    lines.querySelector<HTMLInputElement>('[data-r="0"]')?.focus();
  });

  root.querySelector('[data-sample]')!.addEventListener('click', async () => {
    const s = await import('../lib/sepa/sample');
    const head = s.SAMPLE_HEADER[kind];
    if (!h('name').value) h('name').value = head.name;
    if (!h('iban').value) h('iban').value = head.iban;
    if (!credit && !h('ics').value) h('ics').value = (head as { ics: string }).ics;
    const { headers, rows } = credit ? s.sampleTransfers() : s.sampleDebits();
    load({ headers, rows, source: 'CSV' }, guessMapping(kind, headers, rows));
    lines.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  root.querySelector('[data-model]')!.addEventListener('click', async () => {
    const { modelXlsx } = await import('../lib/sepa/sample');
    download(modelXlsx(kind), credit ? 'modele-virements-sepa.xlsx' : 'modele-prelevements-sepa.xlsx', XLSX_TYPE);
  });

  root.querySelectorAll<HTMLInputElement>('[data-h]').forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
    result.hidden = true;
    refreshSoon();
  }));

  function generate() {
    const c = compose();
    if (!c.xml) return refresh();
    const header = readHeader();
    const date = credit ? (header as CreditHeader).executionDate : (header as DebitHeader).collectionDate;
    const name = `${credit ? 'virements' : 'prelevements'}-sepa-${date}.xml`;
    download(c.xml, name, 'application/xml');
    result.hidden = false;
    result.innerHTML = `<div class="banner ok"><div><strong>Fichier ${esc(name)} téléchargé</strong>
      <p>${c.count} ${credit ? 'virement' : 'prélèvement'}${c.count > 1 ? 's' : ''} pour ${euros(c.total)}, ${credit ? 'exécution' : 'échéance'} le ${frDate(date)}, format ${esc(header.version)}.</p></div></div>
      <div class="card next">
        <h3 style="margin-top:0">Et maintenant ?</h3>
        <ol>
          <li>Dans votre banque en ligne, ouvrez l’espace ${credit ? '« virements groupés », « remise de fichiers » ou « import de virements »' : '« prélèvements SEPA » ou « remise de fichiers »'}.</li>
          <li>Importez le fichier XML, puis vérifiez le nombre d’opérations et le total affichés par la banque : ils doivent être identiques à ceux ci-dessus.</li>
          <li>Validez la remise avec votre moyen d’authentification habituel.</li>
        </ol>
        <p class="hint">Le service d’import de fichiers est parfois une option à activer auprès de votre conseiller, surtout pour les prélèvements.</p>
        <div class="btn-row"><button type="button" class="btn secondary" data-again>Télécharger à nouveau</button></div>
        <details style="margin-top:0.8rem"><summary>Voir le contenu du fichier</summary><pre class="xml-view"><code>${esc(c.xml)}</code></pre></details>
      </div>
      ${thanksCard('conversion')}`;
    bindThanks(result);
    result.querySelector('[data-again]')!.addEventListener('click', () => download(c.xml!, name, 'application/xml'));
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
