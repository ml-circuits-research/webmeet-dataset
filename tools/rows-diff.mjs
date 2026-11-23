// Compares the rows on disk with the last commit (or another git revision), per tab and source, so that no example is
// lost by a repair or a file split. A row is its (text, sop); a source is the file name without its part number
// (data-drop.2.3.csv belongs to data-drop), so moving rows between parts of one source is not a change.
//   node tools/rows-diff.mjs [--rev HEAD] [--examples 3]
// Prints, per tab/source: rows before and after, rows lost, rows added, rows whose circuit changed (same text) and rows
// whose text changed. Exit code 1 when a row was lost or a text changed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? true : all[i + 1]]] : a), []));
const REV = args.rev ?? 'HEAD';
const EXAMPLES = Number(args.examples ?? 3);

function* csvRows(text) {
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); yield row; row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); yield row; }
}
const sourceOf = (path) => { const [tab, file] = path.split('/'); return `${tab}/${file.split('.')[0]}`; };
function read(text, into, source) {
  const rows = csvRows(text);
  const header = rows.next().value ?? [];
  const ti = header.indexOf('text'), si = header.indexOf('sop');
  for (const r of rows) {
    if (r.length < 2) continue;
    // keep fingerprints, not the rows: "<hash of text> <hash of text+sop>", and the text of a few for the report
    const m = into.get(source) ?? new Map();
    const th = createHash('sha1').update(r[ti]).digest('base64').slice(0, 16);
    const key = th + ' ' + createHash('sha1').update(r[ti] + '\u0000' + r[si]).digest('base64').slice(0, 16);
    m.set(key, (m.get(key) ?? 0) + 1);
    into.set(source, m);
    if (!TEXTS.has(th) && TEXTS.size < 200000) TEXTS.set(th, r[ti].slice(0, 120));
  }
}

const before = new Map(), after = new Map(), TEXTS = new Map();
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { maxBuffer: 1 << 30 }).toString();
for (const path of git('ls-tree', '-r', '--name-only', REV).split('\n').filter((p) => /^[^/]+\/[^/]+\.csv$/.test(p))) read(git('show', `${REV}:${path}`), before, sourceOf(path));
for (const tab of readdirSync(ROOT).filter((d) => !d.startsWith('.') && d !== 'tools' && existsSync(join(ROOT, d)))) {
  let files;
  try { files = readdirSync(join(ROOT, tab)).filter((f) => f.endsWith('.csv')); } catch { continue; }
  for (const f of files) read(readFileSync(join(ROOT, tab, f), 'utf8'), after, `${tab}/${f.split('.')[0]}`);
}

let lost = 0, textChanged = 0;
const total = (m) => [...m.values()].reduce((a, b) => a + b, 0);
console.log('source\tbefore\tafter\tlost\tadded\tcircuit changed\ttext changed');
for (const source of [...new Set([...before.keys(), ...after.keys()])].sort()) {
  const b = before.get(source) ?? new Map(), a = after.get(source) ?? new Map();
  const goneKeys = [...b].flatMap(([k, n]) => Array(Math.max(0, n - (a.get(k) ?? 0))).fill(k));
  const newKeys = [...a].flatMap(([k, n]) => Array(Math.max(0, n - (b.get(k) ?? 0))).fill(k));
  if (!goneKeys.length && !newKeys.length && total(b) === total(a)) continue;
  const textOf = (k) => k.split(' ')[0];
  const newTexts = new Map();
  for (const k of newKeys) newTexts.set(textOf(k), (newTexts.get(textOf(k)) ?? 0) + 1);
  let changed = 0;
  const reallyLost = [];
  for (const k of goneKeys) {
    const t = textOf(k);
    if (newTexts.get(t)) { newTexts.set(t, newTexts.get(t) - 1); changed++; } else reallyLost.push(k);
  }
  const added = [...newTexts.values()].reduce((x, y) => x + y, 0);
  lost += reallyLost.length;
  textChanged += Math.min(reallyLost.length, added);
  console.log(`${source}\t${total(b)}\t${total(a)}\t${reallyLost.length}\t${added}\t${changed}\t${Math.min(reallyLost.length, added)}`);
  for (const k of reallyLost.slice(0, EXAMPLES)) console.log(`  lost: ${TEXTS.get(textOf(k)) ?? textOf(k)}`);
}
console.log(`\nrows ${REV}: ${[...before.values()].reduce((a, m) => a + total(m), 0)}, on disk: ${[...after.values()].reduce((a, m) => a + total(m), 0)}; lost ${lost}`);
process.exitCode = lost ? 1 : 0;
