/*
 * Jours ouvrés des paiements en euros : calendrier TARGET (fermé les samedis, dimanches,
 * 1er janvier, Vendredi saint, lundi de Pâques, 1er mai, 25 et 26 décembre).
 * Les jours fériés français ne ferment pas TARGET, mais beaucoup de banques
 * ne traitent pas les remises ces jours-là : on les signale aussi.
 */

export function easterSunday(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export function targetHolidays(year: number): Map<string, string> {
  const e = easterSunday(year);
  return new Map([
    [`${year}-01-01`, 'Jour de l’an'],
    [iso(addDays(e, -2)), 'Vendredi saint'],
    [iso(addDays(e, 1)), 'Lundi de Pâques'],
    [`${year}-05-01`, 'Fête du travail'],
    [`${year}-12-25`, 'Noël'],
    [`${year}-12-26`, 'Lendemain de Noël'],
  ]);
}

export function frenchOnlyHolidays(year: number): Map<string, string> {
  const e = easterSunday(year);
  return new Map([
    [`${year}-05-08`, 'Victoire 1945'],
    [iso(addDays(e, 39)), 'Ascension'],
    [iso(addDays(e, 50)), 'Lundi de Pentecôte'],
    [`${year}-07-14`, 'Fête nationale'],
    [`${year}-08-15`, 'Assomption'],
    [`${year}-11-01`, 'Toussaint'],
    [`${year}-11-11`, 'Armistice'],
  ]);
}

/** Pourquoi la date n'est pas un jour ouvré TARGET (undefined si elle l'est). */
export function closedReason(date: string): string | undefined {
  const d = new Date(date + 'T00:00:00Z');
  const wd = d.getUTCDay();
  if (wd === 6) return 'samedi';
  if (wd === 0) return 'dimanche';
  return targetHolidays(d.getUTCFullYear()).get(date);
}

export const isBusinessDay = (date: string) => !closedReason(date);

/** Prochain jour ouvré TARGET à partir de `date` (incluse si ouvrée), après `skip` jours ouvrés. */
export function nextBusinessDay(date: string, skip = 0): string {
  let d = new Date(date + 'T00:00:00Z');
  while (!isBusinessDay(iso(d))) d = addDays(d, 1);
  for (let n = 0; n < skip; n++) {
    d = addDays(d, 1);
    while (!isBusinessDay(iso(d))) d = addDays(d, 1);
  }
  return iso(d);
}

/** Date locale du jour au format AAAA-MM-JJ. */
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Lit une date saisie (JJ/MM/AAAA, AAAA-MM-JJ, numéro de série Excel). */
export function parseDate(raw: string | number | undefined): string | undefined {
  const s = String(raw ?? '').trim();
  if (!s) return undefined;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if (/^\d{5}(\.0+)?$/.test(s)) {
    // Numéro de série Excel (jours depuis le 30/12/1899).
    return iso(addDays(new Date(Date.UTC(1899, 11, 30)), Math.floor(Number(s))));
  }
  return undefined;
}

function valid(y: number, mo: number, d: number): string | undefined {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return undefined;
  return iso(dt);
}

/** 2026-11-10 → 10/11/2026 */
export const frDate = (isoDate: string) => isoDate.split('-').reverse().join('/');
