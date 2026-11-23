# webmeet-dataset

Training data for the PSys2 reader. The reader takes a message someone types in one tab of the app (Drawing, Diagram,
Document, Calendar, Avatar). From that message it produces SOP Lang wires that say what was asked.

Each row is one message with the wires the reader should produce for it.

## Layout

```text
<tab>/<source>.csv          tab: drawing, diagram, document, calendar, avatar
<tab>/<source>.N.csv        a large source split into parts of at most ~10 MB (one source)
tools/check.mjs             the checker: run it on every new file before adding it
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
| `w.request.lookup` | thing a request needs that the text does not say | `request`, `target` or `constraint` (the wire it completes), `key` (thing, family, sort, value, name), `from` (page, previous, preference, any) |
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

Each example stands alone: there is no hidden page, tab or memory behind it. Write only what the text, and the previous
message when it is given, says:

- **Copy every evidence key exactly from the message**, typos included.
- **Leave out what the text does not say**: no page objects (context wires, `thing` links, ids of the page), no
  `goes_to` (the folder gives the tab), no kind or value the text does not say. A value is either words of the text or
  a value of a closed list (blue, near, left_of, much_more). Never write a summary phrase like "x inverted".
- **Write a lookup** for what a request needs and the text does not give. For "make it shorter" with no previous
  message, write `lookup key=thing from=page`; with a previous message that names the thing, use `from=previous`.
  Better still, add examples where the text itself makes the referent clear.
- **Put greetings, politeness, hedges and remarks around the request in filler wires.** Words that carry meaning must
  be the evidence of a request, target, constraint or unread wire. Never hide them as filler.
- **Keep every proper name** ("Start", "Room 4", "Sales by month") in the wire it belongs to.
- **Write a meaning that has no key yet as `w.request.unread`**, with its words and a `note` naming the meaning, so
  the schema can gain the key.

## Checking new data

`sop-knowledge-worlds` must be cloned next to this repository (or pass `--knowledge DIR`):

```sh
node tools/check.mjs                              # every file (about a minute)
node tools/check.mjs --file diagram/new.csv       # one file
node tools/check.mjs --warnings rewrite.csv       # also list the rows to complete (text, sop, warning, words)
```

**Errors** (the row is refused):
- schema violations: unknown type or key, a value outside an enum, an act that is not in `k.actions`;
- an evidence key that is not words of the text;
- a context wire or a `thing` link;
- `goes_to`;
- a key repeating another;
- a value that is a phrase the text does not say;
- a kind the text does not say;
- an existing target that no words identify and that has no lookup;
- filler that hides content words of a request.

**Warnings** (the row is valid but incomplete; `--warnings` lists them with the words concerned):
- content words of the text that no wire accounts for;
- a proper name of a request that no wire keeps;
- a meaning left in unread.

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

## Contents (2026-11-23)

188,786 messages, moved here from `psys2/official-dataset` (built from the corpora under `psys2/training/sop-bert/data/`
and `psys2/main-synthetic-dataset/`; their history stays in the psys2 repository).

| source | drawing | diagram | document | calendar | avatar | total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| data-drop | 49,207 | 54,302 |  |  | 991 | 104,500 |
| demo-tool-profile | 9,692 | 8,978 | 7,881 | 6,104 | 642 | 33,297 |
| main-synthetic | 11,240 | 2,350 | 1,819 | 647 | 5,198 | 21,254 |
| ui-diagram |  | 6,668 |  |  |  | 6,668 |
| ui-relations | 5,374 |  |  |  |  | 5,374 |
| ui-human | 968 | 1,091 | 1,094 | 319 | 812 | 4,284 |
| ui-systematic | 1,055 | 1,688 | 318 | 149 | 326 | 3,536 |
| ui-coverage | 651 | 824 | 648 | 642 | 415 | 3,180 |
| ui-drawing-style | 1,931 |  |  |  |  | 1,931 |
| ui-natural | 472 | 401 | 200 | 59 | 342 | 1,474 |
| ui-composition | 446 | 422 |  |  |  | 868 |
| ui-comparatives | 422 | 215 |  | 40 | 109 | 786 |
| human-adapted-drawing | 558 |  |  |  |  | 558 |
| human-adapted-diagram |  | 538 |  |  |  | 538 |
| ui-features |  |  |  |  | 249 | 249 |
| ui-quantities | 149 | 25 |  |  |  | 174 |
| ui-diagram-v2-voice |  | 92 |  |  |  | 92 |
| ui-tiers | 4 | 7 | 6 | 6 |  | 23 |
| **total** | **82,169** | **77,601** | **11,966** | **7,966** | **9,084** | **188,786** |

What each source is:

- **data-drop**: written by the data worker session from real request styles found in public corpora (CoDraw,
  ChartDialog, NLV, MagicBrush, PPTC, TeX.SE, WildChat, BLOCKS, IGLU, SCONE, …). Each row was checked on import.
- **demo-tool-profile**: the corpus of the deployed reader (authored by Claude Haiku, plus demo tool supplements).
- **main-synthetic**: systematic generation over every editor operation, parameter and catalog kind, with human-style
  variants.
- **ui-***: case corpora written for specific editor features (relations, comparatives, drawing styles, compositions,
  quantities, avatar features, coverage of every operation).
- **human-adapted-***: real human utterances adapted to the Drawing and Diagram tabs.

Document, Calendar and Avatar are thin (under 12,000 messages each). They are the next areas to fill.

Known data issues (2026-11-23): all rows pass the checker. When the data moved here:
- page contexts that the text does not give were dropped, as were page ids, kinds and value phrases the text does not
  say;
- lookups were written for 49,851 rows whose target the text does not identify;
- filler was marked in 84,000 rows, from w.lang.en, together with remarks outside every request;
- key_words, family_words, name_words and asked_words were added where the text names the key, the family, the
  name or what is asked (with the words the knowledge worlds give for each key).

115,320 rows still carry a warning:
- 112,117 have content words no wire accounts for (the older labels did not record the words behind every wire);
- 34,371 have a meaning left in unread;
- 5,204 lose a proper name.

`node tools/check.mjs --warnings rewrite.csv` lists them with the words concerned. They are the rows to complete or
rewrite first.

## Licence

MIT (see `LICENSE`).
