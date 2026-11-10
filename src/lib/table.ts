import { strFromU8, unzipSync } from 'fflate';

/*
 * Lecture d'un tableau : CSV (séparateur détecté, UTF-8 ou Windows-1252) ou XLSX
 * (première feuille, chaînes partagées, cellules en ligne et nombres).
 */

export interface Table {
  headers: string[];
  rows: string[][];
  source: 'CSV' | 'XLSX';
  sheet?: string;
  separator?: string;
  encoding?: string;
}

export class TableError extends Error {}

function decode(bytes: Uint8Array): { text: string; encoding: string } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'Windows-1252' };
  }
}

/** Analyse CSV conforme RFC 4180 (guillemets, retours à la ligne dans les champs). */
export function parseCsv(text: string, sep?: string): { rows: string[][]; separator: string } {
  const firstLine = text.slice(0, text.search(/\r?\n/) === -1 ? undefined : text.search(/\r?\n/));
  const separator =
    sep ??
    ([';', ',', '\t', '|'] as const)
      .map((s) => [s, firstLine.split(s).length] as const)
      .sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === separator) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows: rows.filter((r) => r.some((v) => v.trim() !== '')), separator };
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

function xml(s: string): Document {
  return new DOMParser().parseFromString(s, 'application/xml');
}

/** Éléments descendants par nom local (indépendant du préfixe d'espace de noms). */
const byTag = (el: Document | Element, name: string) => [...el.getElementsByTagName('*')].filter((e) => e.localName === name);

export function parseXlsx(bytes: Uint8Array): { rows: string[][]; sheet: string } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new TableError('Ce fichier Excel est illisible ou protégé par un mot de passe.');
  }
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : undefined);
  const wb = read('xl/workbook.xml');
  if (!wb) throw new TableError('Classeur Excel incomplet (xl/workbook.xml absent). Les anciens fichiers .xls ne sont pas lus : enregistrez-le en .xlsx ou en CSV.');
  const sheetEl = byTag(xml(wb), 'sheet')[0];
  const sheetName = sheetEl?.getAttribute('name') ?? 'Feuille 1';
  const rid = sheetEl?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ?? sheetEl?.getAttribute('r:id');
  let target = 'worksheets/sheet1.xml';
  const rels = read('xl/_rels/workbook.xml.rels');
  if (rels && rid) {
    const rel = byTag(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
    if (rel) target = (rel.getAttribute('Target') ?? target).replace(/^\/?xl\//, '');
  }
  const sheetXml = read('xl/' + target.replace(/^\//, ''));
  if (!sheetXml) throw new TableError('Feuille introuvable dans le classeur.');

  const shared: string[] = [];
  const sst = read('xl/sharedStrings.xml');
  if (sst) for (const si of byTag(xml(sst), 'si')) shared.push(byTag(si, 't').map((t) => t.textContent ?? '').join(''));

  const rows: string[][] = [];
  for (const r of byTag(xml(sheetXml), 'row')) {
    const idx = Number(r.getAttribute('r') ?? rows.length + 1) - 1;
    const out: string[] = [];
    for (const c of byTag(r, 'c')) {
      const col = colIndex(c.getAttribute('r') ?? '');
      const t = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? '';
      let value: string;
      if (t === 's') value = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') value = byTag(c, 't').map((x) => x.textContent ?? '').join('');
      else if (t === 'b') value = v === '1' ? 'VRAI' : 'FAUX';
      else value = v;
      // Nombres entiers stockés en notation flottante par Excel (552032534.0)
      if (!t && /^\d+\.0+$/.test(value)) value = value.replace(/\.0+$/, '');
      out[col] = value;
    }
    rows[idx] = Array.from(out, (v) => v ?? '');
  }
  return { rows: rows.filter((r) => r && r.some((v) => String(v).trim() !== '')), sheet: sheetName };
}

export function readTable(bytes: Uint8Array, fileName = ''): Table {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (/\.xls$/i.test(fileName) && !isZip) throw new TableError('Les anciens fichiers Excel (.xls) ne sont pas lus : enregistrez le fichier en .xlsx ou en CSV.');
  let rows: string[][];
  let extra: Partial<Table>;
  if (isZip) {
    const r = parseXlsx(bytes);
    rows = r.rows;
    extra = { source: 'XLSX', sheet: r.sheet };
  } else {
    const { text, encoding } = decode(bytes);
    const r = parseCsv(text);
    rows = r.rows;
    extra = { source: 'CSV', separator: r.separator, encoding };
  }
  if (!rows.length) throw new TableError('Le fichier ne contient aucune ligne.');
  const width = Math.max(...rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(rows[0][i] ?? '').trim() || `Colonne ${i + 1}`);
  const body = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => String(r[i] ?? '')));
  return { headers, rows: body, source: extra.source!, ...extra };
}
