// Checks the dataset. Every row of every <tab>/*.csv has the columns text,sop; its circuit (the `sop` cell) must
//   1. conform to the schemas of sop-knowledge-worlds (w.request, with the acts of k.actions): every wire's type is
//      declared, every key is a slot of its type, enums, numbers, references and required keys hold;
//   2. quote the message exactly: every evidence key (a request's words and predicate; a target's sort_words, name,
//      description, count_words, code_words, ids, family_words; a constraint's words, key_words, measure_words; the text
//      of an unread or filler wire) is words of the row's text;
//   3. say nothing the row does not give (errors): no goes_to (the tab is the folder); no context wire or thing link (a
//      page object); no key repeating another (request words equal to the whole text, sort_words equal to sort, a
//      constraint's words equal to its value); a constraint without words has a value the text says; no value that is
//      a phrase the text does not say; no kind the text does not say; an existing target that no words identify has a
//      lookup (w.request.lookup key=thing: the system finds it in the context); no filler hiding content words of a
//      request.
//   4. account for every word (warnings, the row is valid but incomplete): each content word of the text is evidence of a
//      wire or filler. Grammar words (determiners, pronouns, prepositions, conjunctions, auxiliaries, adverbs of
//      w.lang.en.closed, the grammar classes of w.lang.en.skip, w.lang.en.imperative.lead) need no wire; filler words (w.lang.en.skip
//      politeness, filler, desire; interjections) are kept in w.request.filler wires. Also warned: a proper name of a
//      request (a capitalised word not starting a sentence) that no wire keeps, and a meaning left in unread.
//      `--warnings FILE` writes the warned rows to a CSV (text, sop, warning, words) for the generating session.
//   5. use the reader's keys (keys.csv): a constraint's attribute and a target's family are keys of the file's tab, and a
//      value of a closed list is on it unless the constraint says open_value=true (errors); an act does not contradict
//      its predicate (removal against creation or change, by the verbs of k.actions; warning).
//   6. vary its sentences: a file named with --file (new data) has at least 80% distinct sentence shapes once values,
//      names and numbers are removed (--min-shapes); for the whole dataset the files below are listed.
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
const PHRASES = { 'w.request.request': ['words', 'predicate', 'asked_words'], 'w.request.target': ['sort_words', 'name', 'name_words', 'description', 'count_words', 'code_words', 'ids', 'family_words'], 'w.request.constraint': ['words', 'key_words', 'measure_words'], 'w.request.unread': ['text'], 'w.request.filler': ['text'] };
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
const says = (phrase, text) => !!phrase && String(phrase).length > 0 && new RegExp(`(?<![\\w])${esc(String(phrase))}(?:e?s)?(?![\\w])`, 'i').test(text);
// Grammar and filler words of w.lang.en (sop-knowledge-worlds): the words that need no wire, and the words a filler
// wire keeps. Every other word of a message is content.
const LEX = (() => {
  const grammar = new Set(), filler = new Set(), endings = new Set(), contractions = [];
  const dir = join(KNOWLEDGE, 'docs', 'worlds', 'w.lang.en', 'shards');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sop'))) for (const w of parse(readFileSync(join(dir, f), 'utf8'))) {
    const cls = w.attrs.class ? tok(w.attrs.class[0]) : '';
    const texts = (w.attrs.text ?? []).map((t) => tok(t).toLowerCase());
    if (w.type === 'w.lang.en.closed' && ['determiner', 'pronoun', 'preposition', 'conjunction', 'auxiliary', 'particle', 'adverb'].includes(cls)) texts.forEach((t) => grammar.add(t));
    if (w.type === 'w.lang.en.closed' && cls === 'interjection') texts.forEach((t) => filler.add(t));
    if (w.type === 'w.lang.en.skip') texts.forEach((t) => (['politeness', 'filler', 'desire'].includes(cls) ? filler : grammar).add(t));
    if (w.type === 'w.lang.en.imperative.lead') texts.forEach((t) => grammar.add(t)); // words dropped before the verb
    if (w.type === 'w.lang.en.contraction') contractions.push([texts[0], tok(w.attrs.expands[0]).toLowerCase()]);
    if (w.type === 'w.lang.en.contraction.ending') endings.add(tok(w.attrs.ending[0]).toLowerCase());
  }
  for (const [t, e] of contractions) if (e.split(/\s+/).every((x) => grammar.has(x))) grammar.add(t);
  return { grammar, filler, endings };
})();
const isGrammar = (w) => {
  const x = w.toLowerCase().replace(/\u2019/g, "'");
  const i = x.indexOf("'");
  return LEX.grammar.has(x) || (i > 0 && LEX.grammar.has(x.slice(0, i)) && LEX.endings.has(x.slice(i)));
};

// Errors: wires and keys that nothing in the row grounds, or that repeat another key.
function grounding(text, wires, tab) {
  const out = [];
  for (const w of wires) {
    if (w.type === 'w.request.context') out.push([w.type, '', 'page object: not said by the text (write what the text says on the target)']);
    if (w.attrs.thing) out.push([w.type, 'thing', 'link to a page object: not said by the text']);
    if (w.type === 'w.request.request') {
      if (w.attrs.goes_to) out.push([w.type, 'goes_to', 'not said in the text (the tab is the folder)']);
      if (one(w, 'words') === text) out.push([w.type, 'words', 'repeats the whole text (leave it out)']);
    }
    if (w.type === 'w.request.target' && w.attrs.family && !FAMILIES.has(`${tab} ${one(w, 'family')}`)) out.push([w.type, 'family', `not a family of the ${tab} tab (keys.csv)`]);
    if (w.type === 'w.request.constraint' && w.attrs.attribute) {
      const key = KEYS.get(`${tab} ${one(w, 'attribute')}`);
      if (!key) out.push([w.type, 'attribute', `not a key of the ${tab} tab (keys.csv)`]);
      else if (key.values && !w.attrs.open_value) for (const v of w.attrs.value ?? []) if (!key.values.has(tok(v).toLowerCase())) out.push([w.type, 'value', 'not a value of the key (keys.csv), and not marked open_value']);
    }
    if (w.type === 'w.request.target') {
      if (w.attrs.sort_words && one(w, 'sort_words') === one(w, 'sort')) out.push([w.type, 'sort_words', 'repeats sort (leave it out)']);
      if (w.attrs.sort && !w.attrs.sort_words && !says(one(w, 'sort'), text)) out.push([w.type, 'sort', 'a kind the text does not say']);
      const identified = ['name', 'description', 'sort_words', 'code_words', 'count_words', 'ids'].some((k) => w.attrs[k]) || says(one(w, 'sort'), text);
      const looked = wires.some((l) => l.type === 'w.request.lookup' && String(l.attrs.target?.[0]) === '$' + w.id && one(l, 'key') === 'thing');
      if (one(w, 'mode') !== 'new' && one(w, 'fill') !== 'all' && !identified && !looked) out.push([w.type, '', 'existing target no words identify and no lookup (add w.request.lookup key=thing)']);
    }
    if (w.type === 'w.request.constraint') {
      if (w.attrs.words && (w.attrs.value ?? []).length === 1 && String(one(w, 'value')) === one(w, 'words')) out.push([w.type, 'words', 'repeats value (leave it out)']);
      if (!w.attrs.words && !(w.attrs.value ?? []).every((v) => text.includes(tok(v)))) out.push([w.type, 'value', 'neither words nor a value the text says']);
    }
    if (w.type === 'w.request.constraint' || w.type === 'w.request.unread')
      for (const v of w.attrs.value ?? []) if (String(v).startsWith('"') && !/^(-?\d+(\.\d+)?|true|false)$/.test(tok(v)) && !text.includes(tok(v))) out.push([w.type, 'value', 'a phrase the text does not say (keep the words; the system normalises them)']);
  }
  // filler inside a request's words may hold only filler and grammar words
  const spans = wires.filter((w) => w.type === 'w.request.request').map((r) => { const sp = one(r, 'words') ?? text, i = text.indexOf(sp); return i < 0 ? [0, text.length] : [i, i + sp.length]; });
  for (const f of wires.filter((w) => w.type === 'w.request.filler')) {
    const ft = one(f, 'text');
    const outside = [...text.matchAll(new RegExp(`(?<![\\w])${esc(ft)}(?![\\w])`, 'g'))].some((m) => !spans.some(([a, b]) => a <= m.index && m.index < b));
    let rest = ft.toLowerCase();
    for (const ph of [...LEX.filler].filter((x) => x.includes(' '))) rest = rest.replaceAll(ph, ' ');  // "thank you"
    if (!outside && (rest.match(TOKEN) ?? []).some((x) => !isGrammar(x) && !LEX.filler.has(x))) out.push([f.type, 'text', 'filler hides content words of a request']);
  }
  return out;
}
const TOKEN = /[A-Za-z0-9]+(?:['\u2019][A-Za-z]+)?/g;

// The reader's keys per tab (keys.csv): a constraint's attribute and a target's family must be keys of the file's tab,
// and a value of a closed list must be on it (or the constraint says open_value=true).
const KEYS = new Map(), FAMILIES = new Set();
{
  const rows = csvRows(readFileSync(join(DATASET, 'keys.csv'), 'utf8'));
  const h = rows.next().value;
  for (const r of rows) {
    if (r.length < h.length) continue;
    const o = Object.fromEntries(h.map((k, i) => [k, r[i]]));
    KEYS.set(`${o.tab} ${o.key}`, { head: o.head, values: o.values ? new Set(o.values.split('; ').map((x) => x.toLowerCase())) : null });
    FAMILIES.add(`${o.tab} ${o.family}`);
  }
}
// The acts the verbs of k.actions mean (k.actions.verb text=delete act=remove): a predicate that is such a verb should
// go with one of its acts.
const VERB_ACTS = new Map();
{
  const dir = join(KNOWLEDGE, 'docs', 'worlds', 'k.actions', 'shards');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sop'))) for (const w of parse(readFileSync(join(dir, f), 'utf8'))) {
    if (w.type !== 'k.actions.verb' || !w.attrs.act) continue;
    const t = tok(w.attrs.text[0]).toLowerCase();
    if (!VERB_ACTS.has(t)) VERB_ACTS.set(t, new Set());
    for (const a of w.attrs.act) VERB_ACTS.get(t).add(tok(a));
  }
}
const verbActs = (p, words = '') => {
  const x = String(p).toLowerCase(), w = ` ${words.toLowerCase()} `;
  for (const c of [x, x.replace(/s$/, ''), x.replace(/ed$/, ''), x.replace(/d$/, ''), x.replace(/ing$/, ''), x.replace(/ing$/, 'e'), x.replace(/ied$/, 'y'), x.replace(/ies$/, 'y')]) {
    if (!VERB_ACTS.has(c)) continue;
    const acts = new Set(VERB_ACTS.get(c));
    // a phrasal verb of k.actions whose particle the request says ("take the glasses off": take off -> remove)
    for (const [t, a] of VERB_ACTS) if (t.startsWith(c + ' ') && t.split(' ').slice(1).every((part) => w.includes(` ${part} `) || w.includes(` ${part},`))) a.forEach((y) => acts.add(y));
    return acts;
  }
  return null;
};
// The shape of a sentence once its values, names and numbers are removed (for the diversity of a delivered file).
const shapeOf = (text, wires) => {
  let s = text.toLowerCase();
  const vals = wires.flatMap((w) => ['value', 'name', 'description', 'words', 'sort_words', 'predicate'].flatMap((k) => (w.attrs[k] ?? []).map((v) => tok(v).toLowerCase())));
  for (const v of [...new Set(vals)].sort((a, b) => b.length - a.length)) if (v.length > 1) s = s.split(v).join('X');
  return s.replace(/\d+(:\d+)?/g, 'N');
};
const EVIDENCE = ['words', 'predicate', 'asked_words', 'sort_words', 'name', 'name_words', 'description', 'count_words', 'code_words', 'ids', 'family_words', 'key_words', 'measure_words', 'text'];
// Warnings: words of the text no wire accounts for, lost proper names, meanings left in unread.
function warningsOf(text, wires) {
  const out = new Set();
  const covered = new Array(text.length).fill(false);
  const mark = (ph) => {
    if (!ph || String(ph).length < 1) return;
    const re = new RegExp(`(?<![\\w])${esc(String(ph))}(?![\\w])`, 'gi');
    for (const m of text.matchAll(re)) for (let i = m.index; i < m.index + m[0].length; i++) covered[i] = true;
  };
  for (const w of wires) {
    if (w.type === 'w.request.request' || w.type === 'w.request.previous' || w.type === 'w.request.clock') { mark(one(w, 'predicate')); for (const v of w.attrs.asked_words ?? []) mark(tok(v)); continue; }
    for (const k of EVIDENCE) for (const v of w.attrs[k] ?? []) mark(tok(v));
    if (w.type === 'w.request.target' && says(one(w, 'sort'), text)) mark(one(w, 'sort'));
    if (w.type === 'w.request.constraint' && !w.attrs.words) for (const v of w.attrs.value ?? []) mark(tok(v));
  }
  const loose = [...text.matchAll(TOKEN)].filter((m) => !covered[m.index] && !isGrammar(m[0])).map((m) => m[0]);
  if (loose.length) out.add('words no wire formalizes'), (out.loose = [...new Set(loose)].join(' '));
  for (const r of wires.filter((w) => w.type === 'w.request.request')) {
    const acts = r.attrs.predicate ? verbActs(one(r, 'predicate'), one(r, 'words') ?? text) : null;
    // A verb has several acts by context (put, give, make, drop); a verb whose only act in k.actions is removal
    // ("delete the sync") written with another act is a contradiction.
    if (acts && acts.size === 1 && acts.has('remove') && !['remove', 'undo'].includes(one(r, 'act'))) out.add('act contradicts the predicate (a removal verb, by k.actions verbs)');
    const words = one(r, 'words') ?? text;
    const mine = wires.filter((w) => String(w.attrs.request?.[0]) === '$' + r.id);
    for (const name of properNames(words)) if (!mine.some((w) => Object.values(w.attrs).flat().some((v) => tok(v).includes(name)))) out.add('proper name of the text missing from the circuit');
    const unread = mine.filter((w) => w.type === 'w.request.unread');
    if (unread.some((u) => one(u, 'text') === words) || (unread.length && !mine.some((w) => w.type === 'w.request.constraint'))) out.add('meaning left unread (no key yet)');
  }
  return out;
}
// Capitalised words that are not the first word of a sentence (and not "I" or an abbreviation): names to keep.
function properNames(text) {
  const out = [];
  for (const m of text.matchAll(/[A-Z][\w'-]*/g)) {
    const before = text.slice(0, m.index).trimEnd();
    if (!before || /[.!?:;"\u201c(\-\u2014]$/.test(before) || /^I('|$)/.test(m[0]) || /\w/.test(text[m.index - 1] ?? ' ')) continue;
    if (/^[A-Z]{2,}s?$/.test(m[0])) continue;
    out.push(m[0]);
  }
  return out;
}
const warned = new Set(), warnRows = [];
const MIN_SHAPES = Number(args['min-shapes'] ?? 0.8), lowShapes = [];

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
    const shapes = [];
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
        problems.push(...grounding(text, wires, tab));
        shapes.push(shapeOf(text, wires));
        const ws = warningsOf(text, wires);
        for (const why of ws) { warned.add(why); warnRows.push([text, sop, why, why.startsWith('words no wire') ? ws.loose : '']); }
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
    // Diversity: a file of new data repeats no sentence shape (values, names and numbers removed). Checked as an error
    // for a file named with --file (the delivery gate) and reported for every file otherwise.
    if (shapes.length >= 30) {
      const ratio = new Set(shapes).size / shapes.length;
      if (ratio < MIN_SHAPES) {
        lowShapes.push([`${tab}/${file}`, ratio, shapes.length]);
        if (ONLY) { add(`(file) | | repeated sentence shapes: ${Math.round(ratio * 100)}% distinct, at least ${MIN_SHAPES * 100}% needed`, { where: `${tab}/${file}`, text: '', sop: '' }); bad++; }
      }
    }
  }
}
if (!ONLY && lowShapes.length) {
  console.log(`files below ${MIN_SHAPES * 100}% distinct sentence shapes (old data to regenerate): ${lowShapes.length}`);
  for (const [f, r, n] of lowShapes.sort((x, y) => x[1] - y[1]).slice(0, 15)) console.log(`  ${Math.round(r * 100)}%\t${f} (${n} rows)`);
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
  writeFileSync(args.warnings, 'text,sop,warning,words\n' + warnRows.map((r) => r.map(q).join(',')).join('\n') + '\n');
}
process.exitCode = bad ? 1 : 0;
