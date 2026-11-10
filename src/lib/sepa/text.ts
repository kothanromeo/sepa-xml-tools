/*
 * Jeu de caractères des virements et prélèvements SEPA.
 *
 * Les banques françaises n'acceptent, sauf convention, que le « jeu de caractères latins » :
 *   a-z A-Z 0-9 / - ? : ( ) . , ' + et l'espace
 * (guide CFONB du CustomerCreditTransferInitiation, § 1.10). Les identifiants (références,
 * RUM, identifiants de message) ne doivent en plus ni commencer ni finir par « / », ni contenir « // ».
 */

const DISALLOWED = /[^A-Za-z0-9/\-?:().,'+ ]/g;

const REPLACEMENTS: [RegExp, string][] = [
  [/[œ]/g, 'oe'], [/[Œ]/g, 'OE'], [/[æ]/g, 'ae'], [/[Æ]/g, 'AE'], [/ß/g, 'ss'],
  [/[’‘`´]/g, "'"], [/[«»“”"]/g, ''], [/\s*&\s*/g, ' et '], [/€/g, 'EUR'], [/[_]/g, '-'],
  [/[–—]/g, '-'], [/[\r\n\t]+/g, ' '], [/@/g, ' '], [/[°#*;=!<>[\]{}|\\~^$%]/g, ' '],
];

export interface SepaText {
  text: string;
  /** Des caractères ont été remplacés (accents, symboles). */
  changed: boolean;
  /** Le texte a été coupé à la longueur maximale. */
  truncated: boolean;
}

/** Convertit un texte libre en texte SEPA : accents retirés, symboles remplacés, longueur limitée. */
export function sepaText(raw: string | undefined, max: number): SepaText {
  const source = String(raw ?? '').trim();
  let s = source.normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [re, by] of REPLACEMENTS) s = s.replace(re, by);
  s = s.replace(DISALLOWED, ' ').replace(/ {2,}/g, ' ').trim();
  const changed = s !== source.replace(/ {2,}/g, ' ');
  const truncated = s.length > max;
  if (truncated) s = s.slice(0, max).trim();
  return { text: s, changed, truncated };
}

/** Identifiant SEPA (référence, RUM…) : jeu latin, sans « / » en début ou fin, sans « // ». */
export function sepaId(raw: string | undefined, max = 35): SepaText {
  const r = sepaText(raw, Number.MAX_SAFE_INTEGER);
  let s = r.text.replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '').trim();
  const changed = r.changed || s !== r.text;
  const truncated = s.length > max;
  if (truncated) s = s.slice(0, max).replace(/\/+$/, '').trim();
  return { text: s, changed, truncated };
}

/** Le texte ne contient que des caractères du jeu latin SEPA. */
export const isSepaText = (s: string) => !/[^A-Za-z0-9/\-?:().,'+ ]/.test(s);

/** Échappement XML. */
export const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
