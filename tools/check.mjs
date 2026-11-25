// Checks the dataset. Every row of every <tab>/*.csv is one message (`text`) with one or more circuits in the
// columns `sop`, `sop1`, `sop2`, … (each populated cell is ONE independent reading; an empty or whitespace-only cell
// means no such alternative, and the header names are canonical: text,sop,sop1,sop2,… — `sop01` is refused). The
// primary `sop` cell of a record is required: a record whose first reading is blank is refused. Each circuit must
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
//      request; a request's evidence lies inside its own words (no key_words taken from another request).
//   4. account for every word (warnings, the row is valid but incomplete): each content word of the text is evidence of a
//      wire or filler. Grammar words (determiners, pronouns, prepositions, conjunctions, auxiliaries, adverbs of
//      w.lang.en.closed, the grammar classes of w.lang.en.skip, w.lang.en.imperative.lead) need no wire; filler words (w.lang.en.skip
//      politeness, filler, desire; interjections) are kept in w.request.filler wires. Also warned: a proper name of a
//      request (a capitalised word not starting a sentence) that no wire keeps, and a meaning left in unread.
//      `--warnings FILE` writes the warned rows to a CSV (text, sop, warning, words) for the generating session.
//   5. use the reader's keys (w.request keys): a constraint's attribute and a target's family are keys the knowledge
//      declares anywhere (no folder/tab condition: a message is not judged by the folder it lies in, and a key name that
//      two worlds declare with two meanings gets no value bank instead of borrowing one), and a
//      value of a closed list is on it unless the constraint says open_value=true (errors); an act does not contradict
//      its predicate (removal against creation or change, by the verbs of k.actions; warning).
//   6. vary its sentences: with --new (a file of new data) it has at least 80% distinct sentence shapes once values,
//      names and numbers are removed (--min-shapes); for the whole dataset the files below are listed.
// Run before adding new rows:
//   node tools/check.mjs [--file drawing/new-batch.csv [--new]] [--knowledge ../sop-knowledge-worlds] [--limit N] [--top K] [--json OUT]
// --file may name a file outside the dataset folders (a batch to check before it is added). Every circuit diagnostic
// names the numeric CSV record, the line it starts on and the SOP column it came from; one valid alternative never
// hides an invalid one.
// Prints the number of rows that pass and the problems grouped by kind with an example; exit code 1 on any problem.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readRecords } from './rows.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// --name value, or --name alone (true) when the next argument is another --flag or missing
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1] === undefined || all[i + 1].startsWith('--') ? true : all[i + 1]]] : a), []));
const KNOWLEDGE = resolve(args.knowledge ?? process.env.SOP_KNOWLEDGE ?? join(HERE, '..', '..', 'sop-knowledge-worlds'));
if (!existsSync(join(KNOWLEDGE, 'tools', 'sopworld', 'sopworld.mjs'))) throw new Error(`sop-knowledge-worlds not found at ${KNOWLEDGE} (clone it next to this repository or pass --knowledge DIR)`);
const DATASET = resolve(args.dataset ?? join(HERE, '..'));
const ONLY = args.file ? resolve(args.file) : null;
const TAB_WORLD = { drawing: 'w.drawing', diagram: 'w.diagram', document: 'w.document', calendar: 'w.calendar', avatar: 'w.face' };
const PHRASES = { 'w.request.request': ['words', 'predicate', 'asked_words'], 'w.request.target': ['sort_words', 'name', 'name_words', 'description', 'count_words', 'code_words', 'ids', 'family_words'], 'w.request.constraint': ['words', 'key_words', 'measure_words'], 'w.request.lookup': ['words'], 'w.request.unread': ['text'], 'w.request.filler': ['text'] };
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
// The current-text rule: a circuit says what THIS text says plus declared knowledge. A previous message, a clock or a
// referent taken from an earlier message is history, not evidence. It is an error when a delivery is checked (--new or
// --current-text) and a reported count otherwise, so untouched old files are measured without being declared clean.
const CURRENT_TEXT = 'current-text' in args || 'new' in args;
const HISTORY = { previous: 0, clock: 0, from: 0 };
const history = (what) => {
  HISTORY[what]++;
  return CURRENT_TEXT
    ? [['w.request.' + (what === 'from' ? 'lookup' : what), what, 'history: the current text does not say it (no previous message, no clock, no earlier referent)']]
    : [];
};
function grounding(text, wires) {
  const out = [];
  for (const w of wires) {
    if (w.type === 'w.request.previous') { out.push(...history('previous')); continue; }
    if (w.type === 'w.request.clock') { out.push(...history('clock')); continue; }
    if (w.type === 'w.request.lookup' && one(w, 'from') === 'previous') out.push(...history('from'));
    if (w.type === 'w.request.context') out.push([w.type, '', 'page object: not said by the text (write what the text says on the target)']);
    if (w.attrs.thing) out.push([w.type, 'thing', 'link to a page object: not said by the text']);
    if (w.type === 'w.request.request') {
      if (w.attrs.goes_to) out.push([w.type, 'goes_to', 'not said in the text (no routing: a message stands on its own)']);
      if (one(w, 'words') === text) out.push([w.type, 'words', 'repeats the whole text (leave it out)']);
    }
    if (w.type === 'w.request.target' && w.attrs.family && !FAMILIES.has(one(w, 'family'))) out.push([w.type, 'family', 'not a family any w.request key declares']);
    if (w.type === 'w.request.constraint' && !w.attrs.on) out.push([w.type, 'on', 'no on= (required by w.request: attribute, place, size, count ...)']);
    if (w.type === 'w.request.constraint' && !w.attrs.attribute) out.push([w.type, 'attribute', "no reader key (a meaning without a key is an unread wire with a note)"]);
    if (w.type === 'w.request.constraint' && w.attrs.attribute) {
      const key = KEYS.get(one(w, 'attribute'));
      if (!key) out.push([w.type, 'attribute', 'not a key any w.request key declares']);
      else if (key.values && !w.attrs.open_value) for (const v of w.attrs.value ?? []) if (!key.values.has(tok(v).toLowerCase())) out.push([w.type, 'value', 'not a value of the key (w.request keys), and not marked open_value']);
    }
    if (w.type === 'w.request.target') {
      if (w.attrs.sort_words && one(w, 'sort_words') === one(w, 'sort')) out.push([w.type, 'sort_words', 'repeats sort (leave it out)']);
      if (w.attrs.sort && !w.attrs.sort_words && !says(one(w, 'sort'), text)) out.push([w.type, 'sort', 'a kind the text does not say']);
      const identified = ['name', 'description', 'sort_words', 'code_words', 'count_words', 'ids'].some((k) => w.attrs[k]) || says(one(w, 'sort'), text);
      const looked = wires.some((l) => l.type === 'w.request.lookup' && String(l.attrs.target?.[0]) === '$' + w.id && one(l, 'key') === 'thing');
      if (one(w, 'mode') !== 'new' && one(w, 'fill') !== 'all' && !identified && !looked) out.push([w.type, '', 'existing target no words identify and no lookup (add w.request.lookup key=thing)']);
    }
    if (w.type === 'w.request.lookup') {
      const source = one(w, 'from');
      if (one(w, 'key') === 'answer') {
        const owner = wires.find((r) => r.type === 'w.request.request' && '$' + r.id === one(w, 'request'));
        const words = one(w, 'words');
        const ownerWords = owner && one(owner, 'words');
        if (!words || !new RegExp(`(?<![\\w])${esc(words)}(?![\\w])`).test(ownerWords ?? text)) out.push([w.type, 'words', 'answer lookup needs evidence in its request']);
        if (w.attrs.target || w.attrs.constraint) out.push([w.type, 'key', 'answer lookup supplies a separate request input']);
        if (source === 'request') {
          const prior = wires.find((r) => r.type === 'w.request.request' && '$' + r.id === one(w, 'antecedent'));
          const priorWords = prior && one(prior, 'words');
          if (!priorWords || !ownerWords || one(prior, 'act') !== 'ask' || text.indexOf(priorWords) + priorWords.length > text.indexOf(ownerWords))
            out.push([w.type, 'antecedent', 'answer lookup must name an earlier ask in this message']);
        } else if (source !== 'previous' || w.attrs.antecedent || !wires.some((r) => r.type === 'w.request.previous')) {
          out.push([w.type, 'from', 'answer lookup needs an earlier ask or a previous message']);
        }
      } else if (source === 'request' || w.attrs.antecedent) {
        out.push([w.type, 'antecedent', 'local request antecedent requires key=answer']);
      }
    }
    if (w.type === 'w.request.constraint') {
      if (w.attrs.words && (w.attrs.value ?? []).length === 1 && String(one(w, 'value')) === one(w, 'words')) out.push([w.type, 'words', 'repeats value (leave it out)']);
      if (!w.attrs.words && !(w.attrs.value ?? []).every((v) => text.includes(tok(v)))) out.push([w.type, 'value', 'neither words nor a value the text says']);
    }
    if (w.type === 'w.request.constraint' || w.type === 'w.request.unread')
      for (const v of w.attrs.value ?? []) if (String(v).startsWith('"') && !/^(-?\d+(\.\d+)?|true|false)$/.test(tok(v)) && !text.includes(tok(v))) out.push([w.type, 'value', 'a phrase the text does not say (keep the words; the system normalises them)']);
  }
  // a request's evidence lies in its own words: the phrases of its wires are inside the request's `words`
  for (const r of wires.filter((w) => w.type === 'w.request.request' && w.attrs.words)) {
    const words = one(r, 'words');
    for (const w of wires.filter((x) => x === r || String(x.attrs.request?.[0]) === '$' + r.id))
      for (const k of ['predicate', 'asked_words', 'sort_words', 'name', 'name_words', 'description', 'count_words', 'code_words', 'family_words', 'key_words', 'measure_words'])
        for (const v of w.attrs[k] ?? []) if (text.includes(tok(v)) && !words.includes(tok(v))) out.push([w.type, k, "outside its request's words (evidence of another request?)"]);
    // a constraint written without words takes its value as its words: that value must be in the request's words too
    for (const c of wires.filter((x) => x.type === 'w.request.constraint' && String(x.attrs.request?.[0]) === '$' + r.id && !x.attrs.words))
      for (const v of c.attrs.value ?? []) if (text.includes(tok(v)) && !words.includes(tok(v))) out.push([c.type, 'value', "a value outside its request's words (widen the request's words, or write the words it was read from)"]);
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

// The reader's keys per tab, as SOP facts of w.request (sop-knowledge-worlds docs/worlds/w.request/shards/keys.sop:
// w.request.key tab=… family=… name=… head=… value=…): a constraint's attribute and a target's family must be keys of
// the file's tab, and a value of a closed list must be on it (or the constraint says open_value=true).
const KEYS = new Map(), FAMILIES = new Set(), KEY_WORLDS = new Map(), COLLISIONS = new Set();
for (const w of parse(readFileSync(join(KNOWLEDGE, 'docs', 'worlds', 'w.request', 'shards', 'keys.sop'), 'utf8'))) {
  if (w.type !== 'w.request.key') continue;
  const name = one(w, 'name'), values = (w.attrs.value ?? []).map((v) => tok(v).toLowerCase()).sort();
  const decl = { head: one(w, 'head'), values: values.length ? values : null };
  const held = KEYS.get(name);
  // A key is validated by what the knowledge declares, not by the folder a message sits in: no reader `tab` conditions
  // a meaning. A name declared with two different heads or two different value lists is the same label on two
  // concepts: a collision, never a merge. A colliding name is still a declared key (so a row is not refused for
  // naming it), but NO value bank is applied, because borrowing one world's bank would judge a message by its folder.
  if (held) held.decls.push(decl);
  else KEYS.set(name, { decls: [decl] });
  KEY_WORLDS.set(name, [...(KEY_WORLDS.get(name) ?? []), one(w, 'tab')]);
  FAMILIES.add(one(w, 'family'));
}
if (!KEYS.size) throw new Error('no reader keys in w.request/shards/keys.sop');
// The value bank of a key, when the knowledge declares it one way only; a colliding name gets no bank.
for (const [name, held] of KEYS) {
  const bank = (d) => (d.values === null ? null : d.values.join('\u0000'));
  const same = held.decls.every((d) => bank(d) === bank(held.decls[0]) && d.head === held.decls[0].head);
  // An owner that declares no closed list reads the value as written (a span): then no bank may refuse a word, because
  // one of the meanings is open by declaration. Owners that all declare a list must agree, else the name means two
  // things and the diagnostic names them instead of borrowing one list.
  held.values = same ? (held.decls[0].values === null ? null : new Set(held.decls[0].values)) : null;
  if (!same) {
    const owners = KEY_WORLDS.get(name) ?? [];
    held.owners = owners;
    held.banks = held.decls.map((d) => (d.values === null ? 'span' : d.values.join(', ')));
    COLLISIONS.add(name);
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
    // a target's ordinal says its word ("the first paragraph": ordinal=first)
    if (w.type === 'w.request.target' && w.attrs.ordinal) mark(one(w, 'ordinal'));
  }
  // an unread wire holds a meaning in its words: a single grammar word ("out", "up") or a single verb of k.actions
  // ("look", "stay") is not one; a particle belongs to the predicate ("come out"), a verb is the predicate or filler
  // Words of only grammar ("down by", "up the") hold no meaning either; a single content word is a meaning cut out of its
  // phrase (a scene name, note=page.scene, is the exception); a misspelling is not a meaning.
  for (const u of wires.filter((w) => w.type === 'w.request.unread')) {
    const t = one(u, 'text') ?? '';
    const ws = t.match(/[\w'-]+/g) ?? [];
    if (/^[\w'-]+$/.test(t) && (isGrammar(t) || verbActs(t))) out.add('unread holding a single grammar word or verb (a particle belongs to the predicate, a verb is the predicate or filler)');
    else if (ws.length > 1 && ws.every((x) => isGrammar(x))) out.add('unread holding only grammar words');
    else if (ws.filter((x) => !/^(the|a|an|this|that|these|those|its|his|her|their|my|our|your)$/i.test(x)).length === 1 && one(u, 'note') !== 'page.scene') out.add('unread holding a single word (write the phrase it belongs to, or leave it uncovered)'); // "the scene": one word with an article ("first pair" is a phrase)
    if (/misspel|typo/i.test(one(u, 'note') ?? '')) out.add('unread noting a misspelling (a typo is not a meaning: leave it uncovered)');
    if (/^request\.(particle|speed|modality|additionalVerb)$/.test(one(u, 'note') ?? '')) out.add('unread noting a particle, speed or modality (part of the predicate or filler, not a meaning)');
  }
  // what a chart measures or groups by is a thing of the data, never a verb or a grammar word ("get", "sit", "go")
  for (const c of wires.filter((w) => w.type === 'w.request.constraint' && /^chart\.(measure|dimension)$/.test(one(w, 'attribute') ?? '')))
    for (const v of c.attrs.value ?? []) { const ws = tok(v).match(/[\w'-]+/g) ?? []; if (ws.length && ws.every((x) => isGrammar(x) || (verbActs(x) && new RegExp(`(^|\\b(let's|lets|to|you|i|we|please|can|could|will|would|and)\\s+)${esc(x)}\\b`, 'i').test(text)))) out.add('a chart measure or dimension that is a verb or grammar word'); } // a verb only where the text uses it as one ('let's get'); 'by store' names data
  for (const r of wires.filter((w) => w.type === 'w.request.request' && w.attrs.asked_words))
    for (const v of r.attrs.asked_words) if (tok(v) === (one(r, 'words') ?? text).replace(/[?.!]+$/, '') || tok(v).split(/\s+/).length > 4) out.add('asked_words hold the whole request, not the words naming the key asked about');
  // a constraint or unread wire written twice in one request says the same thing twice
  { const seen = new Set();
    for (const w of wires.filter((x) => x.type === 'w.request.constraint' || x.type === 'w.request.unread')) {
      const k = w.type + ' ' + JSON.stringify(Object.entries(w.attrs).sort());
      if (seen.has(k)) out.add('the same wire twice in one request'); seen.add(k);
    } }
  const loose = [...text.matchAll(TOKEN)].filter((m) => !covered[m.index] && !isGrammar(m[0])).map((m) => m[0]);
  if (loose.length) out.add('words no wire formalizes'), (out.loose = [...new Set(loose)].join(' '));
  for (const r of wires.filter((w) => w.type === 'w.request.request')) {
    // "keep two of the trees" is a removal of all the others: its selector carries the exclusion (want=no); a removal
    // under a keeping verb whose selectors exclude nothing would remove the very things to keep
    if (one(r, 'act') === 'remove' && /^(keep|keeps|kept|leave|leaves|left|stay|stays|spare|let|remain|remains)$/i.test(one(r, 'predicate') ?? '')) {
      const sel = wires.filter((w) => w.type === 'w.request.constraint' && String(w.attrs.request?.[0]) === '$' + r.id && one(w, 'phase') === 'selector');
      if (sel.length && !sel.some((w) => one(w, 'want') === 'no')) out.add('a removal under a keeping verb whose selector excludes nothing (keep X = remove the others: want=no)');
    }
    const acts = r.attrs.predicate ? verbActs(one(r, 'predicate'), one(r, 'words') ?? text) : null;
    // A verb has several acts by context (put, give, make, drop); a verb whose only act in k.actions is removal
    // ("delete the sync") written with another act is a contradiction.
    if (acts && acts.size === 1 && acts.has('remove') && !['remove', 'undo'].includes(one(r, 'act'))) out.add('act contradicts the predicate (a removal verb, by k.actions verbs)');
    const words = one(r, 'words') ?? text;
    const mine = wires.filter((w) => String(w.attrs.request?.[0]) === '$' + r.id);
    for (const name of properNames(words)) if (name.toLowerCase() !== String(one(r, 'predicate') ?? '').toLowerCase() && !mine.some((w) => Object.values(w.attrs).flat().some((v) => tok(v).includes(name)))) out.add('proper name of the text missing from the circuit');
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

// One file of the dataset (a tab folder is only where the file lies: no tab conditions a meaning).
const checkFile = (where, content, { diversity = !ONLY || 'new' in args } = {}) => {
  const file_ = readRecords(content);
  if (!file_.ok) { add(`(file) | | ${file_.why}`, { where, text: '', sop: '' }); bad++; return; }
  const shapes = [];
  for (const record of file_.records) {
    if (total >= LIMIT) return;
    const text = record.text;
    const at = { where, text, record: record.record, line: record.line };
    // The first reading of a record is required: a blank (or whitespace-only) primary `sop` cell is refused, even
    // when a later column has a circuit — the record would otherwise pass review without its first reading.
    if (record.primaryBlank) {
      total++; bad++;
      add('(row) | sop | the required primary sop cell is blank (every record needs its first reading)',
        { ...at, sop: record.sop, column: 'sop' });
    }
    for (let index = 0; index < record.extra.length; index++) {
      // A populated cell beyond the declared columns is an undeclared alternative: refuse it by record and column, never
      // drop it. Name it by its position so the fix is unambiguous.
      total++; bad++;
      add('(row) | sop* | a populated cell beyond the declared columns (an undeclared alternative would be dropped)',
        { ...at, sop: record.extra[index], column: `column ${record.extraColumns[index]}` });
      warnRows.push([text, record.extra[index], 'a populated cell beyond the declared columns', '']);
    }
    if (!text.trim()) { bad++; add('(row) | text | empty text', { ...at, sop: '' }); }
    // Each populated SOP column is one independent circuit of the same message: a valid alternative never hides
    // an invalid one, and an error names the record, its line and the column it came from.
    for (const { sop, column } of record.circuits) {
      total++;
      const problems = [];
      let wires;
      try { wires = parse(sop); } catch (e) { problems.push(['(parse)', '', e.message.replace(/".*"/, '"…"')]); }
      if (wires) {
        for (const w of wires) if (!w.type.startsWith('core.') && !base.schema(w.type)) problems.push([w.type, '', 'type declared by no schema']);
        for (const w of wires) {
          for (const key of PHRASES[w.type] ?? []) for (const v of w.attrs[key] ?? []) if (!text.includes(tok(v))) problems.push([w.type, key, 'phrase not found in the text']);
        }
        problems.push(...grounding(text, wires));
        shapes.push(shapeOf(text, wires));
        const ws = warningsOf(text, wires);
        for (const why of ws) { warned.add(why); warnRows.push([text, sop, why, why.startsWith('words no wire') ? ws.loose : '']); }
        const res = base.fork().tell(sop);
        for (const v of res.violations ?? []) {
          const wire = wires.find((w) => w.id === v.id);
          const reason = String(v.why ?? v.kind ?? '').replace(/"[^"]*"/g, '"…"').replace(/\b\d+(\.\d+)?\b/g, 'N');
          problems.push([wire?.type ?? '?', v.key ?? '', reason]);
        }
      } else if (!sop.trim()) problems.push(['(row)', column, 'an empty circuit']);
      if (problems.length) bad++;
      const seen = new Set();
      for (const [type, key, why] of problems) {
        const k = `${type} | ${key} | ${why}`;
        if (seen.has(k)) continue;
        seen.add(k);
        add(k, { ...at, sop, column });
      }
    }
  }
  // Diversity: a file of new data repeats no sentence shape (values, names and numbers removed). Checked as an error
  // with --new (the delivery gate for new data) and reported for every file otherwise.
  if (shapes.length >= 30) {
    const ratio = new Set(shapes).size / shapes.length;
    if (ratio < MIN_SHAPES) {
      lowShapes.push([where, ratio, shapes.length]);
      if (diversity && 'new' in args) { add(`(file) | | repeated sentence shapes: ${Math.round(ratio * 100)}% distinct, at least ${MIN_SHAPES * 100}% needed`, { where, text: '', sop: '' }); bad++; }
    }
  }
};

let checkedOnly = false;
for (const tab of Object.keys(TAB_WORLD)) {
  const dir = join(DATASET, tab);
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.csv')).sort(); } catch { continue; }
  for (const file of files) {
    if (ONLY && resolve(join(dir, file)) !== ONLY) continue;
    if (ONLY) checkedOnly = true;
    checkFile(`${tab}/${file}`, readFileSync(join(dir, file), 'utf8'));
    if (total >= LIMIT) break;
  }
}
// --file may name a file outside the dataset folders (a batch to check before it is added): check it instead of
// silently reporting nothing.
if (ONLY && !checkedOnly) checkFile(String(args.file), readFileSync(ONLY, 'utf8'));

if (!ONLY && lowShapes.length) {
  console.log(`files below ${MIN_SHAPES * 100}% distinct sentence shapes (old data to regenerate): ${lowShapes.length}`);
  for (const [f, r, n] of lowShapes.sort((x, y) => x[1] - y[1]).slice(0, 15)) console.log(`  ${Math.round(r * 100)}%\t${f} (${n} rows)`);
}

const sorted = [...groups.entries()].sort((a, b) => b[1].n - a[1].n);
if (!CURRENT_TEXT && (HISTORY.previous || HISTORY.clock || HISTORY.from))
  console.log(`\nhistory wires (refused by the current-text rule when delivering, --current-text): ${HISTORY.previous} previous, ${HISTORY.clock} clock, ${HISTORY.from} from=previous`);
if (COLLISIONS.size) {
  console.log('\nkey names the knowledge declares with two meanings (unresolved ownership: no value bank is borrowed)');
  for (const name of [...COLLISIONS].sort())
    console.log(`  ${name}: ${(KEYS.get(name).owners ?? []).join(', ')} — ${(KEYS.get(name).banks ?? []).join(' | ')}`);
}
console.log(`circuits ${total}, conforming ${Math.max(0, total - bad)}, not conforming ${bad}; ${groups.size} kinds of violation`);
for (const [k, g] of sorted.slice(0, Number(args.top ?? 60))) {
  console.log(`\n${g.n}\t${k}`);
  for (const e of g.examples.slice(0, 1)) console.log(`\t[${e.where}] ${e.record ? `record ${e.record} (line ${e.line}) ` : ''}(${e.column ?? 'sop'}) ${e.text.slice(0, 120)}`);
}
if (args.json) writeFileSync(args.json, JSON.stringify({ total, bad, groups: sorted.map(([k, g]) => ({ violation: k, ...g })) }, null, 1));
const wc = new Map();
for (const [, , why] of warnRows) wc.set(why, (wc.get(why) ?? 0) + 1);
if (wc.size) {
  console.log(`\nwarnings (rows to rewrite; valid but not grounded): ${new Set(warnRows.map((x) => x[0] + '\0' + x[1])).size} rows`);
  for (const [why, n] of [...wc].sort((a, b) => b[1] - a[1])) console.log(`${n}\t${why}`);
}
if (args.warnings === true) console.error('--warnings needs a file name: --warnings /tmp/rewrite.csv');
// the warnings list never goes into the dataset: a path inside this repository would overwrite or add a data file
if (typeof args.warnings === 'string' && !relative(join(HERE, '..'), resolve(args.warnings)).startsWith('..')) { console.error(`--warnings must be outside the dataset (for example /tmp/warn.csv), not ${args.warnings}`); process.exit(2); }
if (typeof args.warnings === 'string') {
  const q = (x) => '"' + String(x).replaceAll('"', '""') + '"';
  writeFileSync(args.warnings, 'text,sop,warning,words\n' + warnRows.map((r) => r.map(q).join(',')).join('\n') + '\n');
}
process.exitCode = bad ? 1 : 0;
