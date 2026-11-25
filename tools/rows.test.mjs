// The file format of the dataset: `text,sop` and the owner's optional numbered alternatives
// `text,sop,sop1,sop2,…` (one record = one message, each populated SOP column = one independent circuit).
// Run: node --test tools/rows.test.mjs
//
// license: CC0-1.0
// script: node --test tools/rows.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvRows, parseHeader, readRecords, circuitsOf, writeRecords, packRecords } from './rows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '@r1 w.request.request act=make mood=do predicate=draw\n@r1.t w.request.target request=$r1 family=drawn mode=new sort=house';
const B = '@r1 w.request.request act=make mood=do predicate=draw\n@r1.t w.request.target request=$r1 family=drawn mode=new sort=house\n@r1.c1 w.request.constraint request=$r1 on=attribute attribute=drawn.colour value=red operator=eq phase=result';
const q = (s) => '"' + s.replace(/"/g, '""') + '"';

test('an old two-column file reads as before', () => {
  const file = readRecords('text,sop\r\n' + q('draw a red house') + ',' + q(A) + '\r\n');
  assert.equal(file.ok, true);
  assert.equal(file.records.length, 1);
  assert.deepEqual(file.records[0].circuits.map((c) => c.column), ['sop']);
  assert.equal(file.records[0].circuits[0].sop, A);
  assert.equal(file.records[0].text, 'draw a red house');
});

test('numbered alternatives are separate circuits of one record', () => {
  const file = readRecords('text,sop,sop1,sop2\r\n' + q('draw a red house') + ',' + q(A) + ',' + q(B) + ',,\r\n');
  assert.equal(file.ok, true);
  assert.equal(file.records.length, 1);
  assert.deepEqual(file.records[0].circuits.map((c) => c.column), ['sop', 'sop1'], 'an empty optional cell is no alternative');
});

test('the header keeps text,sop first and the numbers in order', () => {
  assert.equal(parseHeader(['text', 'sop']).ok, true);
  assert.equal(parseHeader(['text', 'sop', 'sop1']).ok, true);
  assert.equal(parseHeader(['sop', 'text']).ok, false);
  assert.equal(parseHeader(['text', 'sop', 'note']).ok, false, 'no metadata column: an alternative is a circuit, not a label');
  assert.equal(parseHeader(['text', 'sop', 'sop2']).ok, false, 'a gap would silently drop an alternative');
  assert.equal(parseHeader(['text', 'sop', 'sop1', 'sop1']).ok, false);
});

test('packing repeated rows into columns preserves every (text, circuit) pair', () => {
  const rowsFile = 'text,sop\r\n' + q('draw a red house') + ',' + q(A) + '\r\n' + q('draw a red house') + ',' + q(B) + '\r\n';
  const packedFile = 'text,sop,sop1\r\n' + q('draw a red house') + ',' + q(A) + ',' + q(B) + '\r\n';
  const pairs = (text) => new Set(readRecords(text).records.flatMap((r) => r.circuits.map((c) => `${r.text}\u0000${c.sop}`)));
  assert.deepEqual([...pairs(packedFile)].sort(), [...pairs(rowsFile)].sort(), 'packing loses no circuit and invents none');
  assert.equal(pairs(packedFile).size, 2);
});

test('a quoted circuit keeps its newlines, commas and doubled quotes', () => {
  const sop = '@r1 w.request.request act=make mood=do predicate=draw\n@r1.c1 w.request.constraint request=$r1 on=attribute attribute=drawn.label value="home, sweet" operator=eq phase=result';
  const file = readRecords('text,sop\r\n' + q('label it home, sweet') + ',' + q(sop) + '\r\n');
  assert.equal(file.ok, true);
  assert.equal(file.records[0].circuits[0].sop, sop);
  assert.equal([...csvRows('text,sop\n' + q('a,b') + ',' + q(sop) + '\n')].length, 2);
});

test('circuitsOf sees only the cells that say something', () => {
  const header = parseHeader(['text', 'sop', 'sop1', 'sop2']);
  assert.deepEqual(circuitsOf(['t', A, '', B], header).map((c) => c.column), ['sop', 'sop2']);
  assert.deepEqual(circuitsOf(['t', A, '   ', B], header).map((c) => c.column), ['sop', 'sop2'], 'a whitespace-only cell says nothing: it is no alternative');
});

test('the writer and the reader agree (round trip)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rows-'));
  try {
    const file = join(dir, 'f.csv');
    writeFileSync(file, 'text,sop,sop1\r\n' + q('draw a red house') + ',' + q(A) + ',' + q(B) + '\r\n');
    const back = readRecords(execFileSync('cat', [file]).toString());
    assert.deepEqual(back.records[0].circuits.map((c) => c.sop), [A, B]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the checker judges every populated SOP column on its own', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rows-check-'));
  const file = join(dir, 'fmt.csv');
  try {
    // one record with two valid alternatives and one whose second alternative says nothing the text says
    writeFileSync(file, 'text,sop,sop1\r\n' + q('draw a red house') + ',' + q(A) + ',' + q(B) + '\r\n'
      + q('draw a red house') + ',' + q(A) + ',' + q('@r1 w.request.request act=make mood=do predicate=paint') + '\r\n');
    let out = '';
    try { out = execFileSync('node', [join(ROOT, 'tools/check.mjs'), '--file', file], { cwd: ROOT }).toString(); }
    catch (e) { out = e.stdout?.toString() ?? ''; }
    assert.match(out, /circuits 4, conforming 3, not conforming 1/, out);
    assert.match(out, /\(sop1\) draw a red house/, 'the error names the record and the column');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a header with a routing or metadata column is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rows-header-'));
  const file = join(dir, 'h.csv');
  try {
    writeFileSync(file, 'text,sop,alternative\r\n' + q('draw a red house') + ',' + q(A) + ',1\r\n');
    let out = '';
    try { out = execFileSync('node', [join(ROOT, 'tools/check.mjs'), '--file', file], { cwd: ROOT }).toString(); }
    catch (e) { out = e.stdout?.toString() ?? ''; }
    assert.match(out, /after sop only sop1, sop2,/, out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a populated cell beyond the declared columns is refused, not dropped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rows-extra-'));
  const file = join(dir, 'x.csv');
  try {
    writeFileSync(file, 'text,sop\r\n' + q('draw a red house') + ',' + q(A) + ',' + q(B) + '\r\n');
    let out = '';
    try { out = execFileSync('node', [join(ROOT, 'tools/check.mjs'), '--file', file], { cwd: ROOT }).toString(); }
    catch (e) { out = e.stdout?.toString() ?? ''; }
    assert.match(out, /circuits 2, conforming 1, not conforming 1/, out);
    assert.match(out, /beyond the declared columns/, out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('extra circuits retain their column through empty cells and do not reduce valid circuit counts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rows-extra-location-'));
  const file = join(dir, 'x.csv');
  try {
    const first = q('draw a red house') + ',' + q(A) + ',,' + q(B) + ',   ';
    const second = q('draw a red house') + ',' + q(A) + ',' + q(B);
    const contents = 'text,sop,sop1\r\n' + first + '\r\n' + second + '\r\n';
    writeFileSync(file, contents);
    assert.deepEqual(readRecords(contents).records[0].extraColumns, [4]);
    const spaced = readRecords('text,sop,sop1\r\n' + first + ',' + q(B) + ',   \r\n');
    assert.deepEqual(spaced.records[0].extraColumns, [4, 6]);
    let out = '', status = 0;
    try { out = execFileSync('node', [join(ROOT, 'tools/check.mjs'), '--file', file], { cwd: ROOT }).toString(); }
    catch (e) { out = e.stdout?.toString() ?? ''; status = e.status; }
    assert.equal(status, 1, 'undeclared populated alternatives must fail the check');
    assert.match(out, /circuits 4, conforming 3, not conforming 1/, out);
    assert.match(out, /record 1 \(line 2\) \(column 4\)/, out);
    assert.doesNotMatch(out, /\(column 5\)/, out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writer and reader round trip keeps every column and every circuit', () => {
  const records = [
    { text: 'draw a red house', circuits: [{ sop: A }, { sop: B }] },
    { text: 'draw, a "quoted" house', circuits: [{ sop: A }] },
    { text: 'a third text', circuits: [{ sop: B }] },
  ];
  const text = writeRecords(records);
  assert.match(text.split('\r\n')[0], /^text,sop,sop1,?$/, 'the header numbers every column it writes');
  const back = readRecords(text);
  assert.equal(back.ok, true);
  assert.deepEqual(back.records.map((r) => [r.text, r.circuits.map((c) => c.sop)]),
    records.map((r) => [r.text, r.circuits.map((c) => c.sop)]));
});

test('packing exact-text rows into columns keeps the (text, circuit) pairs that review compares', () => {
  const rowsFile = 'text,sop\r\n' + q('draw a red house') + ',' + q(A) + '\r\n' + q('draw a red house') + ',' + q(B) + '\r\n'
    + q('Draw a red house') + ',' + q(A) + '\r\n';
  const { records } = readRecords(rowsFile);
  const packed = packRecords(records);
  assert.equal(packed.missing.length, 0, 'no faithful pair may disappear');
  const again = readRecords(writeRecords(packed.records));
  assert.equal(again.records.length, 2, 'a differently cased text is not merged');
  assert.deepEqual(again.records.map((r) => r.circuits.length), [2, 1]);
});

test('a whitespace-only cell is no alternative (the format contract, not a silent drop)', () => {
  const file = readRecords('text,sop,sop1\r\n' + q('draw a red house') + ',' + q(A) + ',"   "\r\n');
  assert.equal(file.ok, true);
  assert.deepEqual(file.records[0].circuits.map((c) => c.column), ['sop'], 'whitespace carries no reading');
  const beyond = readRecords('text,sop\r\n' + q('draw a red house') + ',' + q(A) + ',   \r\n').records[0];
  assert.deepEqual(beyond.extra, [], 'a whitespace-only cell beyond the declared columns is not an undeclared alternative');
});

test('a blank required primary sop cell is refused, not counted as a conforming row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rows-empty-'));
  const file = join(dir, 'e.csv');
  try {
    writeFileSync(file, 'text,sop,sop1\r\n' + q('draw a red house') + ',,' + q(A) + '\r\n');
    let out = '';
    try { out = execFileSync('node', [join(ROOT, 'tools/check.mjs'), '--file', file], { cwd: ROOT }).toString(); }
    catch (e) { out = e.stdout?.toString() ?? ''; }
    assert.match(out, /circuits 2, conforming 1, not conforming 1/, out);
    assert.match(out, /the required primary sop cell is blank/, out);
    assert.ok(out.includes('] record 1 (line 2) (sop) '), 'the diagnostic names the record, its line and the column\n' + out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a noncanonical sop01-style header is refused', () => {
  assert.equal(parseHeader(['text', 'sop', 'sop01']).ok, false, 'sop01 and sop1 would be two names for one column');
  assert.equal(parseHeader(['text', 'sop', 'sop1', 'sop02']).ok, false);
  assert.equal(parseHeader(['text', 'sop', 'sop+1']).ok, false);
  assert.equal(parseHeader(['text', 'sop', 'sop 1']).ok, false);
});

test('the numbered headers must be exact and gap-free', () => {
  assert.equal(parseHeader(['text', 'sop', 'sop1', 'sop2']).ok, true);
  assert.equal(parseHeader(['text', 'sop', 'sop2', 'sop1']).ok, false, 'order matters');
  assert.equal(parseHeader(['text', 'sop', 'sop1', 'sop3']).ok, false, 'a gap would lose a column');
  assert.equal(parseHeader(['text', 'sop', 'SOP1']).ok, false, 'the name is sopN');
  assert.equal(parseHeader(['text', 'sop', 'sop0']).ok, false, 'numbering starts at 1');
});

test('the checker names the record, its line and the column in its diagnostic', () => {
  const header = parseHeader(['text', 'sop', 'sop1']);
  assert.equal(header.ok, true);
  const cells = circuitsOf(['draw a red house', A, ''], header);
  assert.deepEqual(cells.map((c) => c.column), ['sop']);
  // every record carries the CSV line it starts on and its 1-based position, for the diagnostics to name it
  const file = readRecords('text,sop,sop1\r\n' + q('one') + ',' + q(A) + ',\r\n' + q('two') + ',,');
  // the first circuit has an embedded newline, so the second record starts after it
  assert.deepEqual(file.records.map((r) => [r.record, r.line]), [[1, 2], [2, 4]]);
  assert.deepEqual(file.records.map((r) => r.primaryBlank), [false, true]);
});
