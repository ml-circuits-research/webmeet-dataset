// Rows of a dataset file: `text,sop` and the owner's optional numbered alternatives `text,sop,sop1,sop2,...`.
// One record is one message; every populated SOP column is ONE independent circuit (a reasonable alternative
// reading of the same message). Empty and whitespace-only cells mean "no such alternative", the header names are
// canonical (`sop1`, never `sop01`), the primary `sop` cell is required, and every record carries the CSV line it
// starts on and its numeric position so a diagnostic can name it. Nothing here joins circuits, adds a
// routing/alternative metadata column, or repeats the message for each alternative.
//
// license: CC0-1.0
// script: none (shared by tools/check.mjs, tools/review.mjs and tools/rows-diff.mjs)

/**
 * CSV records of a file with the line they start on: quotes hold commas, doubled quotes and newlines; a CRLF or LF
 * ends a record. Line 1 is the header, so a record's line is the number an editor or `git diff` shows.
 * @returns {Generator<{row: string[], line: number}>}
 */
export function* csvRecords(text) {
  let row = [], field = '', q = false, line = 1, start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else { if (c === '\n') line++; field += c; } }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); yield { row, line: start }; row = []; field = ''; start = ++line; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); yield { row, line: start }; }
}

/** The rows alone, when the line numbers are not needed. */
export function* csvRows(text) {
  for (const { row } of csvRecords(text)) yield row;
}

/**
 * The header of a dataset file: `text` and the legacy `sop` first, then the optional `sopN` columns in
 * numerical order (sop1, sop2, …). A gap in the numbers is an error: an empty cell means "no alternative",
 * a missing column name would silently drop one.
 * @returns {{ok: boolean, why?: string, text?: number, sops?: {index: number, name: string}[]}}
 */
export function parseHeader(header) {
  if (!Array.isArray(header) || !header.length) return { ok: false, why: 'an empty file has no header' };
  if (header[0] !== 'text' || header[1] !== 'sop')
    return { ok: false, why: 'the header must start with text,sop (then optional sop1,sop2,…)' };
  const sops = [{ index: 1, name: 'sop' }];
  const seen = new Set();
  for (let i = 2; i < header.length; i++) {
    const m = /^sop(\d+)$/.exec(header[i]);
    if (!m) return { ok: false, why: `column ${i + 1} is ${JSON.stringify(header[i])}: after sop only sop1, sop2, … may follow` };
    // `sop01` and `sop1` would be two names for one column: the canonical name is the number, written as it is.
    if (m[1] !== String(Number(m[1])))
      return { ok: false, why: `column ${i + 1} is ${JSON.stringify(header[i])}: the name is sop1, sop2, … (no leading zeros, no sign)` };
    const n = Number(m[1]);
    if (n !== sops.length)
      return { ok: false, why: `column ${JSON.stringify(header[i])} is out of order (expected sop${sops.length})` };
    if (seen.has(n)) return { ok: false, why: `column ${JSON.stringify(header[i])} is repeated` };
    seen.add(n);
    sops.push({ index: i, name: header[i] });
  }
  return { ok: true, text: 0, sops };
}

/**
 * The populated circuits of one record, each with its column name (`sop`, `sop2`, …). A whitespace-only cell says
 * nothing: it is no alternative and no circuit, exactly like an empty cell.
 */
export function circuitsOf(record, header) {
  const out = [];
  for (const { index, name } of header.sops) {
    const cell = record[index];
    if (cell === undefined || String(cell).trim() === '') continue;
    out.push({ sop: String(cell), column: name });
  }
  return out;
}

/**
 * Every record of a file with its circuits; the header is validated first. Each record carries the physical CSV line
 * it starts on and its 1-based position among the data records, so a diagnostic can name it unambiguously.
 */
export function readRecords(text) {
  const it = csvRecords(text);
  const first = it.next().value;
  const header = first?.row ?? [];
  const parsed = parseHeader(header);
  const records = [];
  if (!parsed.ok) return { ...parsed, records };
  let n = 0;
  for (const { row, line } of it) {
    if (!row.length || (row.length === 1 && row[0] === '')) continue;
    // A populated cell the header does not declare would be dropped without a word: keep it visible as `extra` so the
    // checker refuses the record instead of silently losing a circuit.
    const declared = 2 + (parsed.sops.length - 1);
    const extra = [], extraColumns = [];
    for (let index = declared; index < row.length; index++) {
      if (String(row[index]).trim() === '') continue;
      extra.push(row[index]);
      extraColumns.push(index + 1);
    }
    records.push({
      text: row[parsed.text] ?? '', sop: row[1] ?? '', circuits: circuitsOf(row, parsed), extra, extraColumns, cells: row,
      record: ++n, line,
      // The first reading is required: a record with a blank `sop` cell promises nothing the file can review.
      primaryBlank: String(row[1] ?? '').trim() === '',
    });
  }
  return { ...parsed, records };
}

/** CSV quoting: only what needs it (comma, quote, newline, or edge spaces). */
export function cell(value) {
  const v = String(value ?? '');
  return /[",\n\r]|^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/**
 * Write records as `text,sop,sop1,…`: as many SOP columns as the widest record, empty cells for the rest, CRLF
 * line endings, every populated cell kept. The writer never reorders, ranks or drops a circuit.
 * @param {{text: string, circuits: {sop: string}[]}[]} records
 * @param {string} [newline]
 */
export function writeRecords(records, newline = '\r\n') {
  const width = Math.max(1, ...records.map((r) => r.circuits.length));
  const header = ['text', 'sop', ...Array.from({ length: width - 1 }, (_, i) => `sop${i + 1}`)];
  const lines = [header.join(',')];
  for (const r of records) {
    const cells = [cell(r.text)];
    for (let i = 0; i < width; i++) cells.push(cell(r.circuits[i]?.sop ?? ''));
    lines.push(cells.join(','));
  }
  return lines.join(newline) + newline;
}

/**
 * Pack records that share an exact text into one record with the circuits in columns. Differently cased or spelled
 * texts are NOT merged. The set of (exact text, exact circuit) pairs is preserved; a circuit repeated for the same
 * text appears once (a duplicate row and a duplicate column say the same thing).
 * @param {{text: string, circuits: {sop: string}[]}[]} records
 * @param {{dedupe?: boolean}} [opts]
 */
export function packRecords(records, { dedupe = true } = {}) {
  const byText = new Map();
  let lost = 0;
  for (const r of records) {
    const held = byText.get(r.text) ?? [];
    for (const c of r.circuits) {
      const seen = held.some((h) => h.sop === c.sop);
      if (seen && dedupe) { lost++; continue; }
      if (!seen) held.push({ sop: c.sop });
    }
    byText.set(r.text, held);
  }
  const packed = [...byText].map(([text, circuits]) => ({ text, circuits }));
  const pairs = (list) => new Set(list.flatMap((r) => r.circuits.map((c) => `${r.text}\u0000${c.sop}`)));
  const before = pairs(records), after = pairs(packed);
  const missing = [...before].filter((x) => !after.has(x));
  return { records: packed, pairs: after.size, droppedDuplicates: lost, missing };
}
