// Dependency-free reader for .xlsx, .xls and .csv files. Runs entirely in the browser,
// so student lists never leave this computer.

import { readXls, isCompoundFile } from './xls.js';

const UNSUPPORTED = 'This file could not be read. In Excel, use “Save as” → “Excel Workbook (.xlsx)” or “CSV”.';

// The format is detected from the content, not the extension: school software often
// saves HTML or XML tables (or CSV) under an .xls name.
export async function readSpreadsheet(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const baseName = file.name.replace(/\.[^.]+$/, '');
  let sheets;

  if (bytes[0] === 0x50 && bytes[1] === 0x4b) sheets = await readXlsx(buffer);
  else if (isCompoundFile(bytes)) sheets = readXls(buffer);
  else {
    const text = decodeText(bytes);
    if (text.slice(0, 2000).includes('\0')) throw new Error(UNSUPPORTED);
    sheets = /^\s*</.test(text) ? readMarkup(text, baseName) : [{ name: baseName, rows: parseCsv(text) }];
  }
  return sheets.map((s) => ({ name: s.name, rows: trimRows(denseRows(s.rows)) }));
}

// UTF-8 if valid, otherwise Windows-1252 (common for German exports with umlauts).
function decodeText(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const denseRows = (rows) => Array.from(rows, (r) => Array.from(r ?? [], (v) => String(v ?? '').trim()));

// ---------- HTML tables and "XML Spreadsheet 2003" ----------

function readMarkup(text, baseName) {
  if (/urn:schemas-microsoft-com:office:spreadsheet/.test(text.slice(0, 5000))) return readSpreadsheetXml(text);

  const doc = new DOMParser().parseFromString(text, 'text/html');
  const tables = [...doc.querySelectorAll('table')].filter((t) => !t.querySelector('table'));
  if (!tables.length) throw new Error(UNSUPPORTED);
  return tables.map((table, i) => ({
    name: tables.length > 1 ? `${baseName} ${i + 1}` : baseName,
    rows: [...table.rows].map((tr) => [...tr.cells].flatMap((td) => [td.textContent.replace(/\s+/g, ' ')].concat(Array(Math.max(0, td.colSpan - 1)).fill('')))),
  }));
}

function readSpreadsheetXml(text) {
  const doc = parseXml(text);
  const ssAttr = (node, name) => [...node.attributes].find((a) => a.localName === name)?.value;
  return byTag(doc, 'Worksheet').map((ws, i) => {
    const rows = [];
    let r = 0;
    for (const rowNode of byTag(ws, 'Row')) {
      if (ssAttr(rowNode, 'Index')) r = Number(ssAttr(rowNode, 'Index')) - 1;
      const row = (rows[r] = []);
      let c = 0;
      for (const cell of byTag(rowNode, 'Cell')) {
        if (ssAttr(cell, 'Index')) c = Number(ssAttr(cell, 'Index')) - 1;
        row[c] = byTag(cell, 'Data')[0]?.textContent ?? '';
        c += 1 + Number(ssAttr(cell, 'MergeAcross') ?? 0);
      }
      r++;
    }
    return { name: ssAttr(ws, 'Name') ?? `Sheet ${i + 1}`, rows };
  });
}

// ---------- ZIP ----------

async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This does not look like a valid .xlsx file.');

  const decoder = new TextDecoder();
  const entries = new Map();
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('The .xlsx file seems to be damaged.');
    const nameLen = view.getUint16(p + 28, true);
    entries.set(decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)), {
      method: view.getUint16(p + 10, true),
      size: view.getUint32(p + 20, true),
      offset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }

  return async function readText(path) {
    const entry = entries.get(path);
    if (!entry) return null;
    const o = entry.offset;
    const start = o + 30 + view.getUint16(o + 26, true) + view.getUint16(o + 28, true);
    const data = bytes.subarray(start, start + entry.size);
    if (entry.method === 0) return decoder.decode(data);
    if (entry.method !== 8) throw new Error('Unsupported compression in .xlsx file.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  };
}

// ---------- XLSX ----------

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const byTag = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];

function columnIndex(ref) {
  const letters = /^[A-Z]+/i.exec(ref ?? '')?.[0];
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Text of an <si> or <is> node, skipping phonetic hints (<rPh>).
const richText = (node) =>
  byTag(node, 't')
    .filter((t) => t.parentNode.localName !== 'rPh')
    .map((t) => t.textContent)
    .join('');

function resolveTarget(target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ('xl/' + target).split('/');
  const out = [];
  for (const part of parts) part === '..' ? out.pop() : out.push(part);
  return out.join('/');
}

async function readXlsx(buffer) {
  const read = await unzip(buffer);
  const workbookXml = await read('xl/workbook.xml');
  if (!workbookXml) throw new Error('This does not look like an Excel workbook.');

  const sharedXml = await read('xl/sharedStrings.xml');
  const shared = sharedXml ? byTag(parseXml(sharedXml), 'si').map(richText) : [];

  const rels = new Map();
  const relsXml = await read('xl/_rels/workbook.xml.rels');
  if (relsXml) {
    for (const r of byTag(parseXml(relsXml), 'Relationship')) rels.set(r.getAttribute('Id'), r.getAttribute('Target'));
  }

  const sheets = [];
  const sheetNodes = byTag(parseXml(workbookXml), 'sheet');
  for (const [i, node] of sheetNodes.entries()) {
    const relId = [...node.attributes].find((a) => a.localName === 'id')?.value;
    const path = rels.has(relId) ? resolveTarget(rels.get(relId)) : `xl/worksheets/sheet${i + 1}.xml`;
    const xml = await read(path);
    if (xml) sheets.push({ name: node.getAttribute('name') ?? `Sheet ${i + 1}`, rows: readSheet(parseXml(xml), shared) });
  }
  if (!sheets.length) throw new Error('No worksheets found in this file.');
  return sheets;
}

function readSheet(doc, shared) {
  const rows = [];
  for (const rowNode of byTag(doc, 'row')) {
    const rowIndex = Number(rowNode.getAttribute('r') ?? rows.length + 1) - 1;
    const row = [];
    let col = 0;
    for (const c of byTag(rowNode, 'c')) {
      const ref = columnIndex(c.getAttribute('r'));
      if (ref >= 0) col = ref;
      const type = c.getAttribute('t');
      const v = byTag(c, 'v')[0]?.textContent ?? '';
      let value;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = byTag(c, 'is')[0] ? richText(byTag(c, 'is')[0]) : '';
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else value = v;
      row[col++] = value.trim();
    }
    rows[rowIndex] = Array.from(row, (v) => v ?? '');
  }
  return trimRows(Array.from(rows, (r) => r ?? []));
}

// ---------- CSV ----------

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = [';', '\t', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  ',');

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) row.push(field.trim()), (field = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) rows.push([...row, field.trim()]);
  return trimRows(rows);
}

function trimRows(rows) {
  const isEmpty = (r) => r.every((v) => !v);
  while (rows.length && isEmpty(rows.at(-1))) rows.pop();
  while (rows.length && isEmpty(rows[0])) rows.shift();
  return rows;
}

// ---------- Name detection ----------

// Guesses which columns hold first/last names, based on common German and English headers.
export function guessColumns(rows) {
  const header = (rows[0] ?? []).map((v) => String(v).toLowerCase().trim());
  const find = (re, skip = []) => header.findIndex((h, i) => re.test(h) && !skip.includes(i));

  const first = find(/vorname|first ?name|given|rufname|prénom/);
  let last = find(/nachname|langname|last ?name|surname|familienname|family/);
  if (first >= 0 && last < 0) last = find(/^name$/);
  if (first >= 0) return { hasHeader: true, col1: first, col2: last };
  if (last >= 0) return { hasHeader: true, col1: last, col2: -1 };

  const full = find(/^(name|full ?name|schüler|schueler|schülerin|student|kind)/);
  if (full >= 0) return { hasHeader: true, col1: full, col2: -1 };

  // No recognisable header: pick the first column that is mostly text.
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (let c = 0; c < width; c++) {
    const values = rows.map((r) => r[c]).filter(Boolean);
    if (values.length && values.filter((v) => /[a-zäöüß]/i.test(v)).length / values.length > 0.7) {
      return { hasHeader: false, col1: c, col2: -1 };
    }
  }
  return { hasHeader: false, col1: 0, col2: -1 };
}

// If a "Klasse"/class column holds a single value (e.g. "7b"), use it as the class name.
export function guessClassName(rows) {
  const header = (rows[0] ?? []).map((v) => String(v).toLowerCase().trim());
  const col = header.findIndex((h) => /^(klasse|class|lerngruppe|kurs|course)$/.test(h));
  if (col < 0) return null;
  const values = new Set(rows.slice(1).map((r) => String(r[col] ?? '').trim()).filter(Boolean));
  return values.size === 1 ? [...values][0] : null;
}

export function columnLetter(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
