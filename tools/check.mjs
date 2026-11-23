// Checks the dataset: every row of every <tab>/*.csv has the columns text,sop, and its circuit (the `sop` cell)
//   1. conforms to the schemas of sop-knowledge-worlds (w.request, with the acts of k.actions): every wire's type is
//      declared, every key is a slot of its type, enums, numbers, references and required keys hold;
//   2. quotes the message exactly: every phrase slot (words, sort_words, name, description, count_words, code_words,
//      measure_words, and the text of an unread wire) is a substring of the row's text;
//   3. says nothing the row does not give (errors): no goes_to (the tab is the folder, not something the text says);
//      no context wire (a page object: whatever the text says of it is on the target or constraint, the rest is a page
//      state the text does not give) and no thing link;
//      no key repeating another (request words equal to the whole text, sort_words equal to sort, a constraint's words
//      equal to its value); the predicate is words of the text.
//   4. warnings (the row is valid but should be rewritten): an existing target nothing in the row identifies (no name,
//      description, kind words, code or previous message), a target kind the text never says, and a
//      meaning left unread (an unread wire with the request's whole words, or a request with only unread wires), and a
//      value that is a phrase the text does not say (neither the text's words nor a closed-bank atom), and a proper name
//      of the text (a capitalised word not starting a sentence) that no wire of its request keeps.
//      `--warnings FILE` writes those rows to a CSV (text, sop, warning) for the generating session.
// Run before adding new rows:
//   node tools/check.mjs [--file drawing/new-batch.csv] [--knowledge ../sop-knowledge-worlds] [--limit N] [--top K] [--json OUT]
// Prints the number of rows that pass and the problems grouped by kind with an example; exit code 1 on any problem.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const KNOWLEDGE = resolve(args.knowledge ?? process.env.SOP_KNOWLEDGE ?? join(HERE, '..', '..', 'sop-knowledge-worlds'));
if (!existsSync(join(KNOWLEDGE, 'tools', 'sopworld', 'sopworld.mjs'))) throw new Error(`sop-knowledge-worlds not found at ${KNOWLEDGE} (clone it next to this repository or pass --knowledge DIR)`);
const DATASET = resolve(args.dataset ?? join(HERE, '..'));
const ONLY = args.file ? resolve(args.file) : null;
const TAB_WORLD = { drawing: 'w.drawing', diagram: 'w.diagram', document: 'w.document', calendar: 'w.calendar', avatar: 'w.face' };
const PHRASES = { 'w.request.request': ['words', 'predicate'], 'w.request.target': ['sort_words', 'name', 'description', 'count_words', 'code_words', 'ids'], 'w.request.constraint': ['words', 'measure_words'], 'w.request.unread': ['text'] };
const tok = (v) => (String(v).startsWith('"') ? JSON.parse(v) : String(v));
const LIMIT = Number(args.limit ?? Infinity);
const EXAMPLES = Number(args.examples ?? 3);
const REFERENCED = (args.worlds ?? 'k.actions').split(',').filter(Boolean); // worlds whose facts slots refer to by name

const { World, parse } = await import(pathToFileURL(join(KNOWLEDGE, 'tools', 'sopworld', 'sopworld.mjs')));
const { scanWorlds, library } = await import(pathToFileURL(join(KNOWLEDGE, 'tools', 'lib', 'worlds.mjs')));
const { scanSchemas } = await import(pathToFileURL(join(KNOWLEDGE, 'tools', 'lib', 'schemas.mjs')));

// A minimal CSV reader (RFC 4180: quoted fields, doubled quotes, newlines inside quotes).
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

const worlds = scanWorlds(join(KNOWLEDGE, 'docs', 'worlds'));
const schemas = scanSchemas(join(KNOWLEDGE, 'docs', 'worlds'));
const base = new World({ library: { ...library(worlds), ...Object.fromEntries(schemas.map((x) => [x.id, x.schemaText])) } });
base.load('@acts core.use world=std.acts');
const used = base.use('w.request');
if (!used.ok) throw new Error('w.request does not load: ' + JSON.stringify(used.violations?.slice(0, 3)));
// The worlds named by a slot's `type=... by=name` join: their schema and every fact of their shards. Once all facts are
// told, each type of the world is declared complete, so a value that names no fact (act=blorp) is refused, not left as
// an open join.
for (const id of REFERENCED) {
  const u = base.use(id);
  if (!u.ok) throw new Error(`${id} does not load: ${JSON.stringify(u.violations?.slice(0, 3))}`);
  const world = worlds.find((w) => w.id === id);
  if (!world) throw new Error(`no world ${id} under ${KNOWLEDGE}`);
  for (const shard of world.shards) base.tell(shard.text, { factsOnly: true });
  for (const w of parse(world.schemaText ?? readFileSync(join(world.dir, 'schema.sop'), 'utf8'))) if (w.type === 'core.type') base.closeType(w.attrs.of[0]);
}

// A probe the checker must refuse: an act k.actions does not have and a mood outside its enum.
{
  const probe = base.fork().tell('@p w.request.request act=blorp mood=maybe\n@p.t w.request.target request=$p family=drawn mode=new');
  const keys = new Set((probe.violations ?? []).map((v) => v.key));
  if (!keys.has('act') || !keys.has('mood')) throw new Error(`the checker accepts act=blorp mood=maybe: ${JSON.stringify(probe)}`);
}

// What the row itself says: errors for wires and keys that nothing in the row grounds, or that repeat another key.
const one = (w, k) => (w.attrs[k] ? tok(w.attrs[k][0]) : undefined);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const says = (phrase, text) => !!phrase && String(phrase).length > 1 && new RegExp(`(?<![\\w])${esc(String(phrase))}(?:e?s)?(?![\\w])`, 'i').test(text);
function grounding(text, wires) {
  const out = [];
    for (const w of wires) {
    if (w.type === 'w.request.context') out.push([w.type, '', 'page object: not said by the text (write what the text says on the target)']);
    if (w.attrs.thing) out.push([w.type, 'thing', 'link to a page object: not said by the text']);
    if (w.type === 'w.request.request') {
      if (w.attrs.goes_to) out.push([w.type, 'goes_to', 'not said in the text (the tab is the folder)']);
      if (one(w, 'words') === text) out.push([w.type, 'words', 'repeats the whole text (leave it out)']);
    }
    if (w.type === 'w.request.target' && w.attrs.sort_words && one(w, 'sort_words') === one(w, 'sort')) out.push([w.type, 'sort_words', 'repeats sort (leave it out)']);
    if (w.type === 'w.request.constraint' && w.attrs.words && (w.attrs.value ?? []).length === 1 && String(one(w, 'value')) === one(w, 'words')) out.push([w.type, 'words', 'repeats value (leave it out)']);
    if (w.type === 'w.request.constraint' && !w.attrs.words && !(w.attrs.value ?? []).every((v) => text.includes(tok(v)))) out.push([w.type, 'value', 'neither words nor a value the text says']);
  }
  return out;
}
function warningsOf(text, wires) {
  const out = new Set();
  const previous = wires.some((w) => w.type === 'w.request.previous');
  for (const r of wires.filter((w) => w.type === 'w.request.request')) {
    const words = one(r, 'words') ?? text;
    const mine = wires.filter((w) => tok(w.attrs.request?.[0] ?? '') === '$' + r.id || String(w.attrs.request?.[0]) === '$' + r.id);
    const t = mine.find((w) => w.type === 'w.request.target');
    if (t && one(t, 'mode') !== 'new' && !['name', 'description', 'sort_words', 'code_words', 'count_words'].some((k) => t.attrs[k]) && !says(one(t, 'sort'), words) && !previous && one(t, 'fill') !== 'all')
      out.add('existing target nothing in the row identifies');
    if (t && one(t, 'sort') && !t.attrs.sort_words && !says(one(t, 'sort'), text)) out.add('target kind the text never says');
    for (const w of mine.filter((x) => x.type === 'w.request.constraint' || x.type === 'w.request.unread'))
      for (const v of w.attrs.value ?? []) if (String(v).startsWith('"') && !/^-?\d+(\.\d+)?$/.test(tok(v)) && !text.includes(tok(v))) out.add('value the text does not say (an invented phrase)');
    const unread = mine.filter((w) => w.type === 'w.request.unread');
    for (const name of properNames(words)) if (!mine.some((w) => Object.values(w.attrs).flat().some((v) => tok(v).includes(name)))) out.add('proper name of the text missing from the circuit');
    if (unread.some((u) => one(u, 'text') === words) || (unread.length && !mine.some((w) => w.type === 'w.request.constraint'))) out.add('meaning left unread');
  }
  return out;
}
// Capitalised words that are not the first word of a sentence (and not "I"): names the circuit must keep.
function properNames(text) {
  const out = [];
  for (const m of text.matchAll(/[A-Z][\w'-]*/g)) {
    const before = text.slice(0, m.index).trimEnd();
    if (!before || /[.!?:;"“(\-—]$/.test(before) || /^I('|$)/.test(m[0]) || !/^\w/.test(text.slice(m.index - 1, m.index) || ' ') === false) continue;
    if (/^[A-Z]{2,}s?$/.test(m[0])) continue; // an abbreviation (IDs, UTC), not a name
    out.push(m[0]);
  }
  return out;
}
const warned = new Set(), warnRows = [];

const groups = new Map();
let total = 0, bad = 0;
const add = (key, example) => {
  const g = groups.get(key) ?? { n: 0, examples: [] };
  g.n++;
  if (g.examples.length < EXAMPLES) g.examples.push(example);
  groups.set(key, g);
};

outer: for (const tab of Object.keys(TAB_WORLD)) {
  const dir = join(DATASET, tab);
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.csv')).sort(); } catch { continue; }
  for (const file of files) {
    if (ONLY && resolve(join(dir, file)) !== ONLY) continue;
    const rows = csvRows(readFileSync(join(dir, file), 'utf8'));
    const header = rows.next().value;
    const ti = header.indexOf('text'), si = header.indexOf('sop');
    if (header.join(',') !== 'text,sop') { add(`(file) | | the header must be text,sop`, { where: `${tab}/${file}`, text: header.join(','), sop: '' }); bad++; continue; }
    for (const r of rows) {
      if (total >= LIMIT) break outer;
      total++;
      const text = r[ti], sop = r[si];
      const where = `${tab}/${file}`;
      const problems = [];
      let wires;
      try { wires = parse(sop); } catch (e) { problems.push(['(parse)', '', e.message.replace(/".*"/, '"…"')]); }
      if (wires) {
        for (const w of wires) if (!w.type.startsWith('core.') && !base.schema(w.type)) problems.push([w.type, '', 'type declared by no schema']);
        for (const w of wires) {
          for (const key of PHRASES[w.type] ?? []) for (const v of w.attrs[key] ?? []) if (!text.includes(tok(v))) problems.push([w.type, key, 'phrase not found in the text']);
        }
        problems.push(...grounding(text, wires));
        for (const why of warningsOf(text, wires)) { warned.add(why); warnRows.push([text, sop, why]); }
        if (!text.trim()) problems.push(['(row)', 'text', 'empty text']);
        const res = base.fork().tell(sop);
        for (const v of res.violations ?? []) {
          const wire = wires.find((w) => w.id === v.id);
          const reason = String(v.why ?? v.kind ?? '').replace(/"[^"]*"/g, '"…"').replace(/\b\d+(\.\d+)?\b/g, 'N');
          problems.push([wire?.type ?? '?', v.key ?? '', reason]);
        }
      }
      if (problems.length) bad++;
      const seen = new Set();
      for (const [type, key, why] of problems) {
        const k = `${type} | ${key} | ${why}`;
        if (seen.has(k)) continue;
        seen.add(k);
        add(k, { where, text, sop });
      }
    }
  }
}

const sorted = [...groups.entries()].sort((a, b) => b[1].n - a[1].n);
console.log(`circuits ${total}, conforming ${total - bad}, not conforming ${bad}; ${groups.size} kinds of violation`);
for (const [k, g] of sorted.slice(0, Number(args.top ?? 60))) {
  console.log(`\n${g.n}\t${k}`);
  for (const e of g.examples.slice(0, 1)) console.log(`\t[${e.where}] ${e.text.slice(0, 120)}`);
}
if (args.json) writeFileSync(args.json, JSON.stringify({ total, bad, groups: sorted.map(([k, g]) => ({ violation: k, ...g })) }, null, 1));
const wc = new Map();
for (const [, , why] of warnRows) wc.set(why, (wc.get(why) ?? 0) + 1);
if (wc.size) {
  console.log(`\nwarnings (rows to rewrite; valid but not grounded): ${new Set(warnRows.map((x) => x[0] + '\0' + x[1])).size} rows`);
  for (const [why, n] of [...wc].sort((a, b) => b[1] - a[1])) console.log(`${n}\t${why}`);
}
if (args.warnings) {
  const q = (x) => '"' + String(x).replaceAll('"', '""') + '"';
  writeFileSync(args.warnings, 'text,sop,warning\n' + warnRows.map((r) => r.map(q).join(',')).join('\n') + '\n');
}
process.exitCode = bad ? 1 : 0;
