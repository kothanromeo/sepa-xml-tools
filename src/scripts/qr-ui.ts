import { parseAmount, euros } from '../lib/sepa/amount';
import { buildEpc, epcMatrix, epcSvg, prettyRf, rfFrom } from '../lib/sepa/epc';
import { prettyIban } from '../lib/iban';
import { bindThanks, thanksCard } from './creator';
import { download, esc } from './ui';

/** PNG du QR code (fond blanc, marge de 4 modules), pour l'insérer dans une facture. */
function pngBlob(payload: string, scale = 12): Promise<Blob> {
  const qr = epcMatrix(payload);
  const margin = 4;
  const n = qr.size + margin * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  qr.data.forEach((row, y) => row.forEach((on, x) => on && ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale)));
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('PNG'))), 'image/png'));
}

export function mountQr(root: HTMLElement) {
  const form = root.querySelector<HTMLFormElement>('[data-qr-form]')!;
  const out = root.querySelector<HTMLElement>('[data-qr-out]')!;
  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  let thanked = false;

  const mode = () => (form.querySelector<HTMLInputElement>('input[name="mode"]:checked')!.value as 'text' | 'ref');

  const update = () => {
    form.querySelectorAll<HTMLElement>('[data-mode]').forEach((el) => (el.hidden = el.dataset.mode !== mode()));
    const name = field('name').value;
    const iban = field('iban').value;
    if (!name.trim() && !iban.trim()) {
      out.innerHTML = '<p class="hint">Renseignez au moins le nom et l’IBAN : le QR code apparaît ici.</p>';
      return;
    }
    const r = buildEpc({
      name, iban, bic: field('bic').value, amount: field('amount').value, info: field('info').value,
      text: mode() === 'text' ? field('text').value : '',
      reference: mode() === 'ref' ? field('reference').value : '',
    });
    if (!r.payload) {
      out.innerHTML = `<div class="banner err"><div><strong>Pas encore de QR code</strong>${r.errors.map((e) => `<p>${esc(e)}</p>`).join('')}</div></div>`;
      return;
    }
    const cents = parseAmount(field('amount').value).cents;
    const qr = epcMatrix(r.payload);
    out.innerHTML = `<div class="qr-img">${epcSvg(r.payload, 6)}</div>
      <p class="qr-caption"><strong>Payer par virement</strong> : scannez ce code avec l’application de votre banque.</p>
      <dl class="kv qr-kv">
        <dt>Bénéficiaire</dt><dd>${esc(name.trim())}</dd>
        <dt>IBAN</dt><dd class="mono">${esc(prettyIban(r.payload.split('\n')[6]))}</dd>
        ${cents ? `<dt>Montant</dt><dd>${euros(cents)}</dd>` : ''}
        ${mode() === 'ref' && field('reference').value.trim() ? `<dt>Référence</dt><dd class="mono">${esc(field('reference').value.trim())}</dd>` : field('text').value.trim() ? `<dt>Motif</dt><dd>${esc(field('text').value.trim())}</dd>` : ''}
      </dl>
      ${r.warnings.map((w) => `<p class="hint">${esc(w)}</p>`).join('')}
      <div class="btn-row" style="margin-top:0.8rem">
        <button type="button" class="btn" data-png>Télécharger en PNG</button>
        <button type="button" class="btn secondary" data-svg>SVG</button>
      </div>
      <details style="margin-top:0.8rem"><summary>Contenu du QR code (${r.bytes} octets sur 331, version ${qr.version})</summary><pre><code>${esc(r.payload)}</code></pre></details>
      ${thanked ? '' : '<div data-thanks-slot></div>'}`;
    const base = 'qr-code-virement-' + (cents ? String(cents / 100).replace('.', '-') + 'eur' : 'sepa');
    out.querySelector('[data-svg]')!.addEventListener('click', () => {
      download(epcSvg(r.payload!, 8), base + '.svg', 'image/svg+xml');
      showThanks();
    });
    out.querySelector('[data-png]')!.addEventListener('click', async () => {
      download(await pngBlob(r.payload!), base + '.png', 'image/png');
      showThanks();
    });
  };

  const showThanks = () => {
    const slot = out.querySelector('[data-thanks-slot]');
    if (!slot || thanked) return;
    thanked = true;
    slot.outerHTML = thanksCard('conversion');
    bindThanks(out);
  };

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  root.querySelector('[data-rf]')!.addEventListener('click', () => {
    const base = prompt('Numéro de facture ou référence interne (lettres et chiffres, 21 au plus) :', field('text').value.replace(/[^A-Za-z0-9]/g, '').slice(0, 21));
    if (!base) return;
    const rf = rfFrom(base);
    if (!rf) return alert('Référence impossible : utilisez 1 à 21 lettres ou chiffres.');
    field('reference').value = prettyRf(rf);
    update();
  });
  update();
}
