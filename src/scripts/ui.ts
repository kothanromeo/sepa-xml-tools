/* Petits utilitaires d'interface partagés. Toute donnée affichée issue d'un fichier passe par esc(). */

export const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function download(data: Uint8Array | string | Blob, name: string, type: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Branche une zone de dépôt et son champ fichier. */
export function bindDrop(drop: HTMLElement, input: HTMLInputElement, onFile: (f: File) => void) {
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) onFile(f);
  });
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const f = e.dataTransfer?.files[0];
    if (f) onFile(f);
  });
}

export const ICON = { error: '✕', warning: '!', info: 'i', ok: '✓' } as const;

export function issueList(issues: { level: 'error' | 'warning' | 'info'; message: string }[]): string {
  if (!issues.length) return '';
  return `<ul class="checks">${issues
    .map((i) => `<li class="${i.level}"><span class="ic">${ICON[i.level]}</span><div>${esc(i.message)}</div><span></span></li>`)
    .join('')}</ul>`;
}
