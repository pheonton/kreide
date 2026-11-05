// Dependency-free reader for legacy Excel .xls files (BIFF8 / Excel 97–2003, and BIFF5 / Excel 95).
// An .xls file is a "compound file" (a tiny FAT file system) containing a "Workbook" stream
// made of BIFF records. Only cell values are read; formatting is ignored.

const END_OF_CHAIN = 0xfffffffe;
const FREE_SECT = 0xffffffff;

// ---------- Compound file (CFB) ----------

function readCompoundFile(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const miniSectorSize = 1 << view.getUint16(0x20, true);
  const miniCutoff = view.getUint32(0x38, true);
  const sectorOffset = (n) => (n + 1) * sectorSize;
  const entriesPerSector = sectorSize / 4;

  // Locate the FAT sectors: 109 in the header, the rest in the DIFAT chain.
  const fatSectors = [];
  for (let i = 0; i < 109; i++) fatSectors.push(view.getUint32(0x4c + i * 4, true));
  let difat = view.getUint32(0x44, true);
  for (let n = view.getUint32(0x48, true); n > 0 && difat < END_OF_CHAIN; n--) {
    const o = sectorOffset(difat);
    for (let i = 0; i < entriesPerSector - 1; i++) fatSectors.push(view.getUint32(o + i * 4, true));
    difat = view.getUint32(o + (entriesPerSector - 1) * 4, true);
  }

  const fat = [];
  for (const s of fatSectors) {
    if (s >= END_OF_CHAIN || sectorOffset(s) + sectorSize > bytes.length) continue;
    const o = sectorOffset(s);
    for (let i = 0; i < entriesPerSector; i++) fat.push(view.getUint32(o + i * 4, true));
  }

  const chain = (start, table) => {
    const out = [];
    for (let s = start; s < END_OF_CHAIN && out.length <= table.length; s = table[s] ?? END_OF_CHAIN) out.push(s);
    return out;
  };

  const readChain = (start, size) => {
    const out = new Uint8Array(size);
    let written = 0;
    for (const s of chain(start, fat)) {
      if (written >= size) break;
      const part = bytes.subarray(sectorOffset(s), sectorOffset(s) + Math.min(sectorSize, size - written));
      out.set(part, written);
      written += part.length;
    }
    return out;
  };

  // Directory entries (128 bytes each).
  const dirStart = view.getUint32(0x30, true);
  const dirSectors = chain(dirStart, fat);
  const dir = readChain(dirStart, dirSectors.length * sectorSize);
  const dirView = new DataView(dir.buffer);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nameLength = dirView.getUint16(o + 0x40, true);
    const type = dir[o + 0x42];
    if (!type || nameLength < 2) continue;
    entries.push({
      name: String.fromCharCode(...new Uint16Array(dir.slice(o, o + nameLength - 2).buffer)),
      type,
      start: dirView.getUint32(o + 0x74, true),
      size: dirView.getUint32(o + 0x78, true),
    });
  }

  const root = entries.find((e) => e.type === 5);
  let miniStream = null;
  let miniFat = null;

  return function stream(name) {
    const entry = entries.find((e) => e.type === 2 && e.name.toLowerCase() === name.toLowerCase());
    if (!entry) return null;
    if (entry.size >= miniCutoff) return readChain(entry.start, entry.size);

    // Small streams live in the mini stream, addressed by the mini FAT.
    miniStream ??= readChain(root.start, root.size);
    if (!miniFat) {
      const raw = readChain(view.getUint32(0x3c, true), view.getUint32(0x40, true) * sectorSize);
      miniFat = Array.from({ length: raw.length / 4 }, (_, i) => new DataView(raw.buffer).getUint32(i * 4, true));
    }
    const out = new Uint8Array(entry.size);
    let written = 0;
    for (const s of chain(entry.start, miniFat)) {
      if (written >= entry.size) break;
      const part = miniStream.subarray(s * miniSectorSize, s * miniSectorSize + Math.min(miniSectorSize, entry.size - written));
      out.set(part, written);
      written += part.length;
    }
    return out;
  };
}

// ---------- BIFF records ----------

const RECORD = {
  BOF: 0x0809,
  EOF: 0x000a,
  FILEPASS: 0x002f,
  CONTINUE: 0x003c,
  BOUNDSHEET: 0x0085,
  SST: 0x00fc,
  LABELSST: 0x00fd,
  LABEL: 0x0204,
  RSTRING: 0x00d6,
  NUMBER: 0x0203,
  RK: 0x027e,
  MULRK: 0x00bd,
  FORMULA: 0x0006,
  STRING: 0x0207,
  BOOLERR: 0x0205,
};

function* records(data, start = 0) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let p = start; p + 4 <= data.length; ) {
    const type = view.getUint16(p, true);
    const length = view.getUint16(p + 2, true);
    yield { type, offset: p, body: data.subarray(p + 4, p + 4 + length) };
    p += 4 + length;
  }
}

const dv = (body) => new DataView(body.buffer, body.byteOffset, body.byteLength);
const cp1252 = new TextDecoder('windows-1252');

// Strings: BIFF8 uses a flags byte (bit 0 = UTF-16, otherwise Latin-1); BIFF5 uses the code page.
function readString(body, pos, lengthBytes, biff8) {
  const view = dv(body);
  const length = lengthBytes === 1 ? body[pos] : view.getUint16(pos, true);
  pos += lengthBytes;
  if (!biff8) return cp1252.decode(body.subarray(pos, pos + length));
  const wide = body[pos] & 1;
  pos += 1;
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(wide ? view.getUint16(pos + i * 2, true) : body[pos + i]);
  return s;
}

// The shared string table may be split over CONTINUE records; when a string's characters are
// split, the continuation starts with a fresh flags byte.
function readSst(parts) {
  const data = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  const boundaries = new Set();
  let offset = 0;
  for (const p of parts) {
    if (offset) boundaries.add(offset);
    data.set(p, offset);
    offset += p.length;
  }
  const view = dv(data);
  const count = view.getUint32(4, true);
  const strings = [];
  let pos = 8;
  for (let i = 0; i < count && pos + 3 <= data.length; i++) {
    const length = view.getUint16(pos, true);
    const flags = data[pos + 2];
    pos += 3;
    let runs = 0;
    let extra = 0;
    if (flags & 0x08) (runs = view.getUint16(pos, true)), (pos += 2);
    if (flags & 0x04) (extra = view.getUint32(pos, true)), (pos += 4);
    let wide = flags & 1;
    let s = '';
    for (let c = 0; c < length && pos < data.length; c++) {
      if (boundaries.has(pos)) wide = data[pos++] & 1;
      if (wide) (s += String.fromCharCode(view.getUint16(pos, true))), (pos += 2);
      else s += String.fromCharCode(data[pos++]);
    }
    pos += runs * 4 + extra;
    strings.push(s);
  }
  return strings;
}

function rkNumber(rk) {
  let n;
  if (rk & 2) n = rk >> 2;
  else {
    const v = new DataView(new ArrayBuffer(8));
    v.setUint32(4, rk & 0xfffffffc, true);
    n = v.getFloat64(0, true);
  }
  return rk & 1 ? n / 100 : n;
}

const formatNumber = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e10) / 1e10));

function readSheetRecords(data, start, biff8, sst) {
  const rows = [];
  const set = (row, col, value) => ((rows[row] ??= [])[col] = String(value).trim());
  let pendingFormula = null;

  for (const { type, body } of records(data, start)) {
    if (type === RECORD.EOF) break;
    const view = body.length >= 6 ? dv(body) : null;
    const row = view?.getUint16(0, true);
    const col = view?.getUint16(2, true);

    switch (type) {
      case RECORD.LABELSST:
        set(row, col, sst[view.getUint32(6, true)] ?? '');
        break;
      case RECORD.LABEL:
      case RECORD.RSTRING:
        set(row, col, readString(body, 6, 2, biff8));
        break;
      case RECORD.NUMBER:
        set(row, col, formatNumber(view.getFloat64(6, true)));
        break;
      case RECORD.RK:
        set(row, col, formatNumber(rkNumber(view.getUint32(6, true))));
        break;
      case RECORD.MULRK:
        for (let p = 4, c = col; p + 6 <= body.length - 2; p += 6, c++) set(row, c, formatNumber(rkNumber(view.getUint32(p + 2, true))));
        break;
      case RECORD.FORMULA:
        // A string result is stored in the following STRING record.
        if (body[6] === 0 && view.getUint16(12, true) === 0xffff) pendingFormula = { row, col };
        else if (view.getUint16(12, true) !== 0xffff) set(row, col, formatNumber(view.getFloat64(6, true)));
        break;
      case RECORD.STRING:
        if (pendingFormula) set(pendingFormula.row, pendingFormula.col, readString(body, 0, 2, biff8));
        pendingFormula = null;
        break;
    }
  }
  return rows;
}

export function readXls(buffer) {
  const stream = readCompoundFile(buffer);
  const data = stream('Workbook') ?? stream('Book');
  if (!data) {
    if (stream('EncryptedPackage')) throw new Error('This file is password protected. Remove the password in Excel and try again.');
    throw new Error('This .xls file could not be read. In Excel, use “Save as” → “Excel Workbook (.xlsx)”.');
  }

  const sheets = [];
  const sstParts = [];
  let biff8 = true;
  let inSst = false;

  for (const { type, body } of records(data)) {
    if (type === RECORD.BOF) biff8 = dv(body).getUint16(0, true) === 0x0600;
    else if (type === RECORD.FILEPASS) throw new Error('This file is password protected. Remove the password in Excel and try again.');
    else if (type === RECORD.BOUNDSHEET) {
      const view = dv(body);
      if (body[5] === 0) sheets.push({ offset: view.getUint32(0, true), name: readString(body, 6, 1, biff8) }); // worksheets only
    } else if (type === RECORD.SST) {
      sstParts.push(body);
      inSst = true;
      continue;
    } else if (type === RECORD.CONTINUE && inSst) {
      sstParts.push(body);
      continue;
    } else if (type === RECORD.EOF) break;
    inSst = false;
  }

  const sst = sstParts.length ? readSst(sstParts) : [];
  return sheets.map((s) => ({ name: s.name, rows: readSheetRecords(data, s.offset, biff8, sst) }));
}

export const isCompoundFile = (bytes) => bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
