// Reviews a repaired file against its last committed version, the way the coordinator does before a commit:
//   node tools/review.mjs --file drawing/scenes-08.csv [--sample 20] [--seed 1]
//   node tools/review.mjs --file diagram/charts-04.csv --head diagram/data-drop.2.csv   (a part of a split file)
// It only reads (the committed version through `git show`); it changes nothing. Checks:
//   BLOCKING (exit code 1):
//   - a row lost, added or with its text changed (a split file: pass every part, or --head with the source);
//   - a committed constraint that disappeared (not rewritten with the same request, key and value);
//   - checker errors (tools/check.mjs);
//   REVIEW (listed with examples, to fix before READY):
//   - new wires holding only grammar words, or a chart measure/dimension that is a verb ("get", "sit");
//   - new unread holding one word, with or without an article ("a caption"), except a scene name;
//   - new unread whose note is a particle, speed, modality or a misspelling;
//   - new unread whose meaning has a key now (page.time, page.weather, page.scene, page.style, drawn.arrangement,
//     drawn.action, chart.colourBy, chart.aggregate);
//   - new drawn.action values that do not start with a verb of doing ("made of gold" is a material);
//   - rows with more than 10 new lines (a script running away);
//   - the same wire twice in a request.
//   Then a sample of changed rows, as - (committed) / + (now) lines, to read against the text.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? true : all[i + 1]]] : a), []));
const files = String(args.file ?? '').split(',').filter(Boolean);
if (!files.length) { console.error('usage: node tools/review.mjs --file TAB/FILE.csv[,TAB/PART2.csv] [--head TAB/SOURCE.csv] [--sample 20]'); process.exit(2); }
const SAMPLE = Number(args.sample ?? 12);
let seed = Number(args.seed ?? 1);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function* csvRows(text) {
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); yield row; row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); yield row; }
}
const rows = (text) => { const it = csvRows(text); const h = it.next().value ?? []; const ti = h.indexOf('text'), si = h.indexOf('sop'); return [...it].filter((r) => r.length > 1).map((r) => ({ text: r[ti], sop: r[si] })); };
const git = (...a) => { try { return execFileSync('git', ['-C', ROOT, ...a], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return null; } };

const heads = args.head ? String(args.head).split(',').filter(Boolean) : files;
// a text can occur several times (with different circuits): rows are paired by text, unchanged circuits first
const committed = new Map();
let committedRows = 0;
for (const h of heads) { const t = git('show', `HEAD:${h}`); if (t === null) { console.error(`no committed version of ${h} (pass --head with the source file of a split)`); process.exit(2); } for (const r of rows(t)) { committedRows++; committed.set(r.text, [...(committed.get(r.text) ?? []), r.sop]); } }
const after = files.flatMap((f) => rows(readFileSync(join(ROOT, f), 'utf8')).map((r) => ({ ...r, file: f })));
const lostRows = [];
{
  const byText = new Map(); for (const r of after) byText.set(r.text, [...(byText.get(r.text) ?? []), r]);
  for (const [t, olds] of committed) {
    const nows = byText.get(t) ?? [], left = [...olds];
    for (const r of nows) { const i = left.indexOf(r.sop); if (i >= 0) { r.old = left.splice(i, 1)[0]; } }
    for (const r of nows) if (r.old === undefined && left.length) r.old = left.shift();
    for (const _ of left) lostRows.push(t);
  }
}
const before = { size: committedRows };

const GRAMMAR = new Set('the a an of to in on up down out off over by for with at as and or but so is are be been was were it its this that these those there here then than too very just only also again back away about into onto from'.split(' '));
const ARTICLE = /^(the|a|an|this|that|these|those|its|his|her|their|my|our|your)$/i;
const VERBISH = new Set('get go sit sits put make show set let see want need have has do does'.split(' '));
const DOING = /^(chase|chases|chasing|chased|play|plays|playing|swim|swims|swimming|follow|follows|following|ride|rides|riding|nuzzle|nuzzles|nuzzling|sniff|sniffs|sniffing|feed|feeds|feeding|carry|carries|carrying|collide|colliding|crash|crashing|run|runs|running|bite|bites|biting|bark|barks|barking|shake|wave|waves|waving|throw|throws|pull|pulls|kick|kicks|push|pushes|pick|watch|watches|watching|stare|hand|hold|holds|holding|herd|pet|call|look|bump|dance|dances|jump|jumps|sing|sings|read|reads|eat|eats|drink|drinks|fly|flies|climb|climbs|cry|cries|laugh|laughs|sleep|sleeps|hug|hugs|stop|put her hands|put its legs)\b/i;
const KEYED = /^(page\.(time|weather|scene|style)|drawn\.(arrangement|lineup|action)|chart\.(aggregation|colourby))$/;
const words = (s) => s.match(/[\w'-]+/g) ?? [];
const tok = (v) => (v.startsWith('"') ? v.slice(1, -1) : v);
const attr = (l, k) => { const m = l.match(new RegExp(` ${k}=("[^"]*"|\\S+)`)); return m ? m[1] : null; };
const ckey = (l) => [attr(l, 'request'), attr(l, 'attribute'), attr(l, 'value')].join('|');

const blocking = [], review = new Map(), changed = [];
const note = (kind, text, line) => { const g = review.get(kind) ?? []; g.push([text, line]); review.set(kind, g); };

// rows
for (const r of after) if (r.old === undefined) blocking.push(`row added or text changed: ${r.text.slice(0, 100)}`);
for (const t of lostRows) blocking.push(`row lost: ${t.slice(0, 100)}`);

for (const r of after) {
  const old = r.old;
  if (old === undefined || old === r.sop) continue;
  changed.push(r);
  const oldLines = new Set(old.split('\n')), nowLines = r.sop.split('\n');
  const nowKeys = new Set(nowLines.filter((l) => l.includes(' w.request.constraint ')).map(ckey));
  for (const l of old.split('\n')) if (l.includes(' w.request.constraint ') && !nowKeys.has(ckey(l))) blocking.push(`committed constraint lost: ${r.text.slice(0, 80)}  ::  ${l.slice(0, 110)}`);
  const added = nowLines.filter((l) => !oldLines.has(l));
  if (added.length > 10) note('rows with more than 10 new lines (a script running away?)', r.text, `${added.length} new lines`);
  const dup = new Set();
  for (const l of nowLines) if (/ w\.request\.(constraint|unread) /.test(l)) { const b = l.slice(l.indexOf(' ') + 1); if (dup.has(b)) note('the same wire twice in a request', r.text, l); dup.add(b); }
  for (const l of added) {
    if (!l.trim()) { note('blank line in a circuit', r.text, '(empty line)'); continue; }
    if (l.includes(' w.request.unread ')) {
      const t = tok(attr(l, 'text') ?? ''), n = tok(attr(l, 'note') ?? ''), ws = words(t);
      if (ws.length && ws.every((w) => GRAMMAR.has(w.toLowerCase()))) note('new unread of only grammar words', r.text, l);
      else if (ws.filter((w) => !ARTICLE.test(w)).length === 1 && n !== 'page.scene') note('new unread of one word (with or without an article)', r.text, l);
      if (/^request\.(particle|speed|modality|additionalVerb)$/.test(n) || /misspel|typo/i.test(n)) note('new unread noting a particle, speed, modality or misspelling', r.text, l);
      if (KEYED.test(n)) note('new unread whose meaning has a key now (write a constraint)', r.text, l);
    }
    if (l.includes(' w.request.constraint ')) {
      const a = attr(l, 'attribute') ?? '', v = tok(attr(l, 'value') ?? '');
      if (/^chart\.(measure|dimension)$/.test(a) && words(v).length && words(v).every((w) => GRAMMAR.has(w.toLowerCase()) || VERBISH.has(w.toLowerCase()))) note('new chart measure/dimension that is a verb or grammar word', r.text, l);
      if (a === 'drawn.action' && !DOING.test(v)) note('new drawn.action that is not something a figure does', r.text, l);
      if (/^chart\.[xy]Label$/.test(a) && /^[XYxy]$/.test(v)) note('new axis label that is only the axis letter ("in the X" names the axis)', r.text, l);
    }
  }
}

// checker
const summary = []; let errors = 0;
for (const f of files) {
  let out = '';
  try { out = execFileSync('node', [join(ROOT, 'tools/check.mjs'), '--file', f], { maxBuffer: 1 << 28 }).toString(); } catch (e) { out = e.stdout?.toString() ?? ''; }
  const lines = out.split('\n').filter((l) => /^circuits|^\d+\t/.test(l));
  errors += Number((lines[0] ?? '').match(/not conforming (\d+)/)?.[1] ?? 0);
  summary.push(`${f}: ${lines.join(' | ')}`);
}
if (errors) blocking.push(`${errors} checker errors (run node tools/check.mjs --file ...)`);

console.log(`files: ${files.join(', ')}  (committed: ${heads.join(', ')})`);
console.log(`rows: committed ${before.size}, now ${after.length}, changed ${changed.length}`);
console.log('checker:\n  ' + summary.join('\n  '));
console.log(`\nBLOCKING: ${blocking.length}`);
for (const b of blocking.slice(0, 15)) console.log('  ' + b);
console.log(`\nREVIEW (fix before READY): ${[...review.values()].reduce((a, g) => a + g.length, 0)}`);
for (const [k, g] of review) { console.log(`  ${g.length}\t${k}`); for (const [t, l] of g.slice(0, 3)) console.log(`      ${t.slice(0, 90)}\n        ${l.slice(0, 140)}`); }
console.log(`\nSAMPLE of ${Math.min(SAMPLE, changed.length)} changed rows (read each against its text):`);
const pick = [...changed]; for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
for (const r of pick.slice(0, SAMPLE)) {
  const o = new Set(r.old.split('\n')), n = new Set(r.sop.split('\n'));
  console.log(`\n# ${r.text.slice(0, 150)}`);
  for (const l of r.old.split('\n')) if (!n.has(l)) console.log('   - ' + l.slice(0, 150));
  for (const l of r.sop.split('\n')) if (!o.has(l)) console.log('   + ' + l.slice(0, 150));
}
process.exitCode = blocking.length ? 1 : 0;
