# webmeet-dataset

Training data for the PSys2 reader. The reader takes a message someone types in one tab of the app (Drawing, Diagram,
Document, Calendar). From that message it produces SOP Lang wires that say what was asked.

Each row is one message with the wires the reader should produce for it. Use the [shared grading legend](semantic/LEGEND.md) to report formaliser quality.

## Two layers of labels

| Folder | Contents |
| --- | --- |
| `semantic/` | The messages with their semantic circuits (`w.request` and related worlds): what was asked. Everything this dataset held before 2026-11-27 is here, with `LEGEND.md` and `NAMES.md`. |
| `syntactic/` | The same messages with their syntactic circuits (`syntax` schema): clauses, nominals and how they are tied. Filled file by file; see `syntactic/README.md`. |

The sections below describe the semantic layer. Its paths are relative to `semantic/`.

## Layout

```text
<tab>/<source>.csv          tab: drawing, diagram, document, calendar
<tab>/<source>.N.csv        a large source split into parts of at most ~10 MB (one source)
tools/check.mjs             the checker: run it on every new file before adding it
tools/rows-diff.mjs         rows on disk against the last commit, per source: lost, added, changed (no example may be lost)
```

Every file has the same two columns:

| column | contents |
| --- | --- |
| `text` | the message, exactly as typed |
| `sop` | its circuit in SOP Lang, one wire per line |

The files are standard CSV (RFC 4180). A cell with commas, quotes or line breaks is quoted. A quote inside a cell is
written twice (`""`). The `sop` cell spans several lines. Python's `csv`, pandas, LibreOffice and Excel read the files as
they are.

The file name says where the rows came from. Some sources are weighted differently at training time, so put new data in
a new file: for example `diagram/external-chartdialog.csv`, not appended to an existing file.

## The circuit

The wires follow the `w.request` schema of
[sop-knowledge-worlds](https://github.com/ml-circuits-research/sop-knowledge-worlds) (`docs/worlds/w.request/schema.sop`,
documented in its `WORLD.md`). Every row must conform to that schema; `tools/check.mjs` enforces it.

The circuit is the formalisation of the text and of nothing else. Three rules make that checkable:

1. **Evidence.** Every wire keeps the words of the message it was read from. A wire with no words of the text is an
   invention.
2. **Every word is accounted for.** Each content word of the message is the evidence of some wire, or it is filler.
   Grammar words (articles, pronouns, prepositions, auxiliaries …) need nothing: the structure expresses them.
3. **What is needed but not said is asked for, not invented.** When a request needs something the text does not say
   (which thing "it" is), the circuit says so with a `w.request.lookup` wire. The system then looks it up in the
   context: the page, the previous turns, the preferences.

```text
text: please switch to the robot preset

@f1 w.request.filler text=please
@r1 w.request.request act=change mood=do predicate=switch
@r1.t w.request.target request=$r1 family=face mode=existing determiner=definite fill=context
@r1.l1 w.request.lookup request=$r1 target=$r1.t key=thing from=page
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=face.preset value=robot operator=eq phase=result key_words=preset
```

Here "please" is filler, "switch" is the predicate, "robot" is the value (a value equal to its words needs no
`words`), and "preset" names the key. "the" is a grammar word, written as `determiner=definite`. Which face is meant
is not said, so a lookup asks for it.

```text
text: move the house to 260,180, then make the house blue

@r1 w.request.request act=place mood=do words="move the house to 260,180" predicate=move
@r1.t w.request.target request=$r1 family=drawn mode=existing determiner=definite fill=description sort=house
@r1.c1 w.request.constraint request=$r1 on=attribute attribute=drawn.x value="260" operator=eq phase=result
@r1.c2 w.request.constraint request=$r1 on=attribute attribute=drawn.y value="180" operator=eq phase=result
@r2 w.request.request act=change mood=do words="make the house blue" predicate=make
@r2.t w.request.target request=$r2 family=drawn mode=existing determiner=definite fill=description sort=house
@r2.c1 w.request.constraint request=$r2 on=attribute attribute=drawn.colour value=blue operator=eq phase=result
```

### The wires

| wire | one per | keys (evidence keys in **bold**) |
| --- | --- | --- |
| `w.request.request` | request in the message (a message can hold several) | `act` (a `k.actions` act), `mood` (do, ask, check, propose), **`words`** (the part of the text this request covers, when it is not the whole message), **`predicate`** (the verb as said), `question` and `asked` for questions with **`asked_words`** ("what colour"), `mode` (the finer act, see below) |
| `w.request.target` | request: what it acts on | `family` (drawn, node, chart, meeting, part, face, text, …), `mode` (new, existing, bound), `determiner`, `fill` (written, context, description, all, journal_step), `sort` (its kind; evidence when the text says it) and **`sort_words`** (the words that said it, when they differ from `sort`), **`name`** and **`name_words`** ("called", "labelled"), **`description`**, `count` and **`count_words`**, `quantifier`, `ordinal`, **`code_words`**, **`ids`**, **`family_words`** ("the chart" when no kind is said) |
| `w.request.constraint` | condition of a request | `attribute` (the reader key: drawn.colour, chart.labels, meeting.time, …), `value` (repeated for several values), **`words`** (the words of the value, when they differ from it), **`key_words`** (the words naming the key: "the colour", "facing"), `operator` (eq, degree, delta, relation, …), `phase` (selector: picks the target; result: the outcome wanted), `on` (attribute, place, count, size), `want=no` for a negation, `character=preference`, `step`, `unit`, `measure` and **`measure_words`**, `scope`, `open_value` |
| `w.request.unread` | meaning with no reader key yet | **`text`** (the words), `note` (the meaning's name), `value` (only a value the text says or a closed-list value) |
| `w.request.lookup` | thing a request needs that the text does not say | `request`, `target` or `constraint` (the wire it completes), `key` (thing, family, sort, value, name, answer), `from` (page, previous, preference, any, request), `antecedent` (local ask), **`words`** (answer reference) |
| `w.request.filler` | run of filler words | **`text`**: politeness ("please", "thank you"), hedges ("um", "just", "actually"), wishes ("I want"), greetings, and remarks around the requests ("that would help", "because the report uses it") |
| `w.request.previous` | message, when there was a previous message | `text` |
| `w.request.clock` | message, when the time matters (calendar) | `now`, `timezone` |

A key is written only when it says something new. When it is left out, the defaults are:

- the request covers the whole message (`words`);
- the target's kind words are the kind itself (`sort_words`);
- the constraint's words are its value (`words`);
- the constraint is wanted (`want=yes`) and required (`character=requirement`).

**Acts.** `act` must name an act of `k.actions`. When the app has a finer act, `act` is the general act and `mode`
holds the finer one:

| finer act | written as |
| --- | --- |
| answer a question | `act=ask` |
| select | `act=pick` |
| arrange, merge | `act=place mode=arrange`, `act=group mode=merge` |
| ungroup, split, disconnect | `act="take apart" mode=ungroup` (or `split`, `disconnect`) |
| reverse, set | `act=change mode=reverse`, `act=change mode=set` |
| repeat | `act=copy mode=repeat` |

**Lookups, and why not `?x`.** SOP Lang has variables (`?x`), but only in queries and in the patterns of a rule. A fact
cannot hold one: sopworld refuses `@t target thing=?x`. A circuit is a set of facts, so it says what is missing with a
lookup fact. The host then turns the lookup into a query on its context. For `key=thing` it runs
`ask('@x <thing type of the area>')` over the page, trying the selection or the last thing made first. One match
completes the target; several or none make the host ask the person. Use a lookup only for something the request
needs. Never fill it with a guess.

## Writing new data

**The circuit formalises what is said, not what makes sense.** "make the eyes straight" is formalised as a change of the
eyes with the value "straight", even though eyes cannot be straight. Judging sense is the job of the SOP interpretation,
which has the schemas and the knowledge; a formaliser (a reader model) has neither. Such requests are useful examples.
The checker asks only for a coherent formalisation:
- every wire has its words;
- the keys belong to the tab;
- a value is on its key's list or marked `open_value=true`;
- the act does not contradict its verb.

It never asks for knowledge of the world.

Each example stands alone: there is no hidden page, tab or memory behind it. Write only what the text, and the previous
message when it is given, says:

- **Copy every evidence key exactly from the message**, typos included.
- **Leave out what the text does not say**: no page objects (context wires, `thing` links, ids of the page), no
  `goes_to` (the folder gives the tab), no kind or value the text does not say. A value is either words of the text or
  a value of a closed list (blue, near, left_of, much_more). Never write a summary phrase like "x inverted".
- **Write a lookup** for what a request needs and the text does not give. For "make it shorter" with no previous
  message, write `lookup key=thing from=page`; with a previous message that names the thing, use `from=previous`.
  Better still, add examples where the text itself makes the referent clear.
- **Refer to an earlier answer** with `@r2.l2 w.request.lookup request=$r2 key=answer from=request antecedent=$r1 words=them`.
  Name the earlier ask in the same message and quote the referring phrase. Keep any chart or other target lookup on
  its own wire. If the answer comes from the previous message, write `key=answer from=previous` with evidence words,
  keep the `w.request.previous` wire, and omit the local antecedent.
- **Put greetings, politeness, hedges and remarks around the request in filler wires.** Words that carry meaning must
  be the evidence of a request, target, constraint or unread wire. Never hide them as filler.
- **Use the reader keys of the file's tab**, declared as SOP facts in `sop-knowledge-worlds`
  `docs/worlds/w.request/shards/keys.sop` (`w.request.key tab=… family=… name=… head=… value=…`), and only the values of a key's closed list (or mark
  `open_value=true` for words outside it, as written).
- **Vary the sentences**: start each row from a real line of a source corpus; no frame with values swapped in.
- **A one-word value may be written bare** (`value=dusk`, `text=harbour`), as SOP Lang allows; quotes are needed only
  for phrases (`words="at dusk"`). Both forms are accepted.
- **Keep every proper name** ("Start", "Room 4", "Sales by month") in the wire it belongs to.
- **Write a meaning that has no key yet as `w.request.unread`**, with its words and a `note` naming the meaning, so
  the schema can gain the key. Keys gained this way (2026-11-23): `page.scene` ("a harbour"), `page.time` ("at dusk"),
  `page.weather` ("in the fog"), `page.style` ("as a pencil sketch"), `drawn.arrangement` ("in a row"),
  `drawn.action` ("chase the cat"), `chart.colourBy` ("coloured by region") and `median` for `chart.aggregate`; write
  these as constraints now, with a closed-list value and the said words (`value=dusk words="at dusk"`).

## Checking new data

`sop-knowledge-worlds` must be cloned next to this repository (or pass `--knowledge DIR`):

```sh
node tools/check.mjs                              # every file (about a minute)
node tools/check.mjs --file diagram/new.csv       # one file (repairing old rows)
node tools/check.mjs --file diagram/new.csv --new # a file of new data: also the diversity gate
node tools/check.mjs --warnings /tmp/rewrite.csv       # also list the rows to complete (text, sop, warning, words)
node tools/rows-diff.mjs                          # before a commit: no row lost, no text changed (exit 1 otherwise)
node tools/review.mjs --file drawing/scenes-08.csv            # review a repair against its committed version
node tools/review.mjs --file diagram/a.1.csv,diagram/a.2.csv --head diagram/a.csv   # the parts of a split file
```

`tools/review.mjs` is the review a repair gets before it is committed; run it before every READY. It only reads.
- **BLOCKING** (exit code 1): a row lost or added, a text changed, a committed constraint that disappeared, checker
  errors.
- **REVIEW**: new wires the rules below forbid (grammar-only or one-word unread, notes that are not meanings, unread
  whose meaning has a key now, a verb as chart measure, `drawn.action` that is not something a figure does, an axis
  letter as axis label, duplicates, runaway rows), with examples.
- **SAMPLE**: changed rows as `-` (committed) and `+` (now) lines, to read against their text.

A file is ready when BLOCKING is 0, REVIEW is 0 (or each remaining line is explained in the READY), and the sample
reads right.

When a published constraint is wrong, the coordinator can approve an exact migration in
`tools/migrations/*.json`. Each entry identifies the `file`, unchanged `text`, full old constraint
lines in `remove`, and exact replacement wires in `require`. Review it with
`node tools/review.mjs --file TAB/FILE.csv --migration tools/migrations/FILE.json`.
Missing or ambiguous source rows, missing replacements, retained retired wires and other constraint
losses still block publication. The normal command keeps refusing all constraint losses.

**Errors** (the row is refused). Each line is the message the checker prints, with its rule:
- *schema violations*: a type or key `w.request` does not declare, a value outside an enum, an act not in `k.actions`;
- *not a key / family of the tab (w.request keys)*: a constraint `attribute` or a target `family` the file's tab does not have;
- *no on=*: a constraint without `on` (required by `w.request`: attribute, place, size, count …);
- *no reader key*: a constraint without `attribute` (a meaning without a key is an unread wire with a note);
- *not a value of the key, and not marked open_value*: a value outside the key's closed list;
- *phrase not found in the text*: an evidence key (`words`, `predicate`, `sort_words`, `name`, `text` …) that is not
  words of the text;
- *a phrase the text does not say*: a quoted value the text does not contain (keep the words; the system normalises);
- *neither words nor a value the text says*: a constraint with no `words` whose value the text does not say;
- *outside its request's words*: evidence or a value that belongs to another request of the same text;
- *repeats value / repeats sort / repeats the whole text*: `words` equal to the value, `sort_words` equal to `sort`,
  request `words` equal to the whole text (leave them out);
- *page object / link to a page object / goes_to*: a context wire, a `thing` link or `goes_to` (not said by the text);
- *a kind the text does not say*: a target `sort` the text does not say;
- *existing target no words identify and no lookup*: add `w.request.lookup key=thing`;
- *filler hides content words of a request*: filler inside a request's words may hold only filler and grammar words;
- with `--new` (a file of new data): fewer than 80% distinct sentence shapes once values, names and numbers are removed.

**Warnings** (the row is valid but incomplete; `--warnings` lists them with the words concerned). A file delivered for
review has no warning of the kinds marked *, apart from what the schema cannot say yet:
- *words no wire formalizes*: content words no wire accounts for;
- *meaning left unread (no key yet)*: a request whose meaning is only in unread wires;
- *proper name of the text missing from the circuit*;
- \* *unread holding a single grammar word or verb*: a particle belongs to the predicate ("come out"), a verb is the
  predicate or filler;
- \* *unread holding only grammar words* ("down by", "up the");
- \* *unread holding a single word*: one word, with or without an article ("caption", "a caption", "the scene"; "first
  pair" is a phrase); write the phrase it belongs to, or leave the word uncovered (a scene name with `note=page.scene` is the
  exception);
- \* *unread noting a misspelling*: a typo is not a meaning, leave it uncovered;
- \* *unread noting a particle, speed or modality* (`note=request.particle`, `request.speed`, `request.modality`,
  `request.additionalVerb`): "wrap Main up", "quickly", "could" belong to the predicate or are filler;
- \* *a chart measure or dimension that is a verb or grammar word*: what is counted or grouped by is a thing of the
  data ("let's get a bar chart of the documents": the documents, not "get");
- \* *the same wire twice in one request*;
- \* *act contradicts the predicate*: a verb whose only act in `k.actions` is removal ("delete") written with another act;
- \* *a removal under a keeping verb whose selector excludes nothing*: "keep two of the trees" removes the others, its
  selector carries `want=no`;
- \* *asked_words hold the whole request*: they name only the key asked about.

What the checker cannot see, a review reads: whether a note names what its words mean ("to the drawing" is not a
scene), whether `words` hold only the words that say the value (not "I'd like the colour"), and whether a repair kept
the meaning of the row (never rewrite "keep X" as removing X). Read 20 changed rows of every file before delivering it.

For the whole dataset the checker also lists the files below 80% distinct sentence shapes (old generated data to
regenerate).

Grammar and filler words come from `w.lang.en` in sop-knowledge-worlds:
- **grammar**: `w.lang.en.closed` determiners, pronouns, prepositions, conjunctions, auxiliaries, particles and
  adverbs; the grammar classes of `w.lang.en.skip`; `w.lang.en.imperative.lead`; contractions that expand to these;
- **filler**: the politeness, filler and desire classes of `w.lang.en.skip`, and interjections.

The checker uses no word list of its own. Fix rows that fail. When the data carries a real meaning the schema lacks,
extend the schema in sop-knowledge-worlds. Never bend the meaning to fit.

## How PSys2 uses it

`psys2/official-dataset/sop_dataset.py load` reads these files and writes the files the reader trainer reads. It gives
each row an id, assigns it at random to train/dev/test (94/4/2), and adds the copies with an unrelated previous message.
`sop_dataset.py check` confirms that the files hold every row of the former official dataset without loss.

## One target per request — a codec limit, refused loudly

`w.request` lets one request carry several `w.request.target` wires (`request=$r1` twice, `@r1.t1 door`,
`@r1.t2 window`). The trainer row this codec builds holds a single `target` per request, so a second target
wire would be projected away: its `sort`, `name` and the lookups that point at it were silently replaced by
the later wire's. `sop_dataset.parse` now refuses such a circuit instead of losing data:

```
ValueError: target r1.t2 and target r1.t1 both belong to request $r1: this codec keeps one target per
request, so r1.t2 would be dropped (unsupported singleton projection; write the separable effects as one
request per target)
```

A wire declared twice with the same id (`@r1.t` on two lines) is one target written twice, not two objects,
and is accepted. Single-target circuits behave exactly as before.

The refusal describes the codec's capacity, not the natural-language request: "make the door and the window
blue" is an ordinary request, and its lossless form is two requests, one per target, each with
`words_origin=hull` (the implicit span of the full source text), which the codec round-trips with both
targets and both results intact. This applies to separable effects; a collective effect over several things
(align them, move them together) has no canonical retention yet.

Measured on the current corpus (`189,119` rows of `webmeet-dataset/`), `1,125` rows carry distinct target
wires on one request and now refuse — the largest groups are `diagram/nodes-05.csv` (365),
`diagram/charts-06.csv` (169), `diagram/nodes-12.csv` (144), `drawing/scenes-05.csv` (121) and
`diagram/nodes-04.csv` (81). `load` stops at the first such row and names its file and text, so a full
load/export is not claimed to succeed while these rows lack a lossless interpretation. They include
spurious extra targets and part-scope mistakes, so no automatic rewrite follows from the count.

## Where some examples come from

Most rows are written here. `drawing/scenes-22.csv` carries the examples migrated from PSys2's
paraphrase store: `psys2/training/paraphrases/out/art.draw.jsonl` at psys2 `dbcfba2db`. It now holds 98 examples
from nine source groups — `draw-a-red-house` (11, no setup), `color-the-house-blue` (10) and
`make-the-house-bigger` (11) in the first batch; `change-the-picture-to-night` (11, no setup) and
`set-the-cat-size-to-huge` (11, setup `Draw a cat.`) in the second; and
`change-the-scene-to-sunset`, `draw-a-blue-car`, `put-grass-on-the-ground` and
`paint-the-sky-dark-blue` (11 each, no setup) in the third. Every single-setup group keeps the
source's setup message as `w.request.previous` with a previous-message lookup where it supplies
the referent. Wording is unchanged; the circuits were authored here in the current `w.request`
form (the source's `core.request` labels are legacy and were not used). The legacy store stays in
place: the path and revision above are the provenance, and the records not migrated yet remain
available for the next batches — the two-command groups `move-the-tree-to-the-left`,
`delete-the-car`, `change-the-sky-color-of-a-night-picture` (setup `Draw me a nice picture.`, `Make it
night.`) and `go-back-to-the-day-picture-after-a-mood-change`, the groups that need a key the schema does
not have yet
(`give-the-house-a-blue-door`, `make-the-door-of-the-house-green`, the palette questions
`ask-which-things-can-be-drawn` and `ask-which-colors-are-available`), and the context-bearing
`make the house blue` record, whose identically worded committed row lacks its setup.

The second and third batches add 66 examples from the same source revision: 22 in the second
(`change-the-picture-to-night`, `set-the-cat-size-to-huge`) and 44 in the third (the four no-setup
groups above). Prior records and their circuits remain unchanged; the source still retains the
deferred context-bearing and multi-command records.

## Contents (2026-11-23)

188,786 messages, moved here from `psys2/official-dataset` (built from the corpora under `psys2/training/sop-bert/data/`
and `psys2/main-synthetic-dataset/`; their history stays in the psys2 repository).

| source | drawing | diagram | document | calendar | total |
| --- | ---: | ---: | ---: | ---: | ---: |
| data-drop | 49,207 | 54,302 |  |  | 103,509 |
| demo-tool-profile | 9,692 | 8,978 | 7,881 | 6,104 | 32,655 |
| main-synthetic | 11,240 | 2,350 | 1,819 | 647 | 16,056 |
| ui-diagram |  | 6,668 |  |  | 6,668 |
| ui-relations | 5,374 |  |  |  | 5,374 |
| avatar-main-synthetic | 5,198 |  |  |  | 5,198 |
| ui-human | 968 | 1,091 | 1,094 | 319 | 3,472 |
| ui-systematic | 1,055 | 1,688 | 318 | 149 | 3,210 |
| ui-coverage | 651 | 824 | 648 | 642 | 2,765 |
| ui-drawing-style | 1,931 |  |  |  | 1,931 |
| ui-natural | 472 | 401 | 200 | 59 | 1,132 |
| avatar-data-drop | 991 |  |  |  | 991 |
| ui-composition | 446 | 422 |  |  | 868 |
| avatar-ui-human | 812 |  |  |  | 812 |
| ui-comparatives | 422 | 215 |  | 40 | 677 |
| avatar-demo-tool-profile | 642 |  |  |  | 642 |
| human-adapted-drawing | 558 |  |  |  | 558 |
| human-adapted-diagram |  | 538 |  |  | 538 |
| avatar-ui-coverage | 415 |  |  |  | 415 |
| avatar-ui-natural | 342 |  |  |  | 342 |
| avatar-ui-systematic | 326 |  |  |  | 326 |
| avatar-ui-features | 249 |  |  |  | 249 |
| ui-quantities | 149 | 25 |  |  | 174 |
| avatar-ui-comparatives | 109 |  |  |  | 109 |
| ui-diagram-v2-voice |  | 92 |  |  | 92 |
| multiwoz-v1 |  |  |  | 48 | 48 |
| avatar-magicbrush-v1 | 45 |  |  |  | 45 |
| smcalflow-v1 |  |  |  | 32 | 32 |
| avatar-emuedit-v1 | 30 |  |  |  | 30 |
| wildchat-v1 |  |  | 27 |  | 27 |
| ui-tiers | 4 | 7 | 6 | 6 | 23 |
| avatar-codraw-v1 | 18 |  |  |  | 18 |
| pptc-v1 |  |  | 18 |  | 18 |
| texse-v1 |  |  | 17 |  | 17 |
| **total** | **91,346** | **77,601** | **12,028** | **8,046** | **189,021** |

What each source is:

- **data-drop**: written by the data worker session from real request styles found in public corpora (CoDraw,
  ChartDialog, NLV, MagicBrush, PPTC, TeX.SE, WildChat, BLOCKS, IGLU, SCONE, …). Each row was checked on import.
- **demo-tool-profile**: the corpus of the deployed reader (authored by Claude Haiku, plus demo tool supplements).
- **main-synthetic**: systematic generation over every editor operation, parameter and catalog kind, with human-style
  variants.
- **ui-***: case corpora written for specific editor features (relations, comparatives, drawing styles, compositions,
  quantities, avatar features, coverage of every operation).
- **human-adapted-***: real human utterances adapted to the Drawing and Diagram tabs.

Priorities (owner, 2026-11-23): Drawing and Diagram. Drawing people (hair, faces, clothes, poses) is part of drawing and
uses the drawing tab's wires; there is no special Avatar data. The former avatar rows (9,177) are in `drawing/avatar-*.csv`,
written with the drawing keys: parts as `part.*` (the drawing part gained variant, size, length, value, place, property,
scale, ids), the face and figure as the drawn person `drawn.*` (expression, preset, base, characterKind, sex, age …), the
avatar's display as `page.mode` and `page.duration`. Document and Calendar are not a priority.

Known data issues (2026-11-23): all rows pass the checker. When the data moved here:
- page contexts that the text does not give were dropped, as were page ids, kinds and value phrases the text does not
  say;
- lookups were written for 49,851 rows whose target the text does not identify;
- filler was marked in 84,000 rows, from w.lang.en, together with remarks outside every request;
- key_words, family_words, name_words and asked_words were added where the text names the key, the family, the
  name or what is asked (with the words the knowledge worlds give for each key).

Warnings after the repairs of 2026-11-23 (counted on the committed files):
- 85,793 content words no wire accounts for (the older labels did not record the words behind every wire);
- 29,849 meanings left in unread (10,000 others became constraints when their keys were added);
- 3,803 proper names missing from the circuit.

`node tools/check.mjs --warnings /tmp/rewrite.csv` lists them with the words concerned. They are the rows to complete or
rewrite first.

## Licence

MIT (see `LICENSE`).
