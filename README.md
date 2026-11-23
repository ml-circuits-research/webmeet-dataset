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

| wire | one per | main keys |
| --- | --- | --- |
| `w.request.previous` | message, when there was a previous message | `text` |
| `w.request.clock` | message, when the time matters (calendar) | `now`, `timezone` |
| `w.request.request` | request in the message (a message can hold several) | `act` (a `k.actions` act), `mood` (do, ask, check, propose), `words` (the part of the text this request covers, when it is not the whole message), `predicate` (the verb as said), `question` and `asked` for questions, `mode` (the finer act, see below) |
| `w.request.target` | request: what it acts on | `family` (drawn, node, chart, meeting, part, face, text, …), `mode` (new, existing, bound), `determiner`, `fill` (how an existing target is given: written, context, description, all, journal_step), `sort` (its kind) and `sort_words` (the words that said it, when they differ from `sort`), `name`, `description`, `count`, `count_words`, `quantifier`, `ordinal`, `code_words`, `ids` |
| `w.request.constraint` | condition of a request | `attribute` (the reader key: drawn.colour, chart.labels, meeting.time, …), `value` (repeated for several values), `words` (the words of the text that say it, when they differ from the value), `operator` (eq, degree, delta, relation, …), `phase` (selector: picks the target; result: the outcome wanted), `on` (kind of condition: attribute, place, count, size), `want=no` for a negation, `character=preference`, `step`, `unit`, `measure`, `measure_words`, `scope`, `open_value` |
| `w.request.unread` | meaning with no reader key yet | `text` (the words), `note` (the meaning's name), `value` |

A key is written only when it says something new. Left out, it means: the request covers the whole message (`words`), the
target's kind words are the kind itself (`sort_words`), the constraint's words are its value (`words`), the constraint
is wanted (`want=yes`) and required (`character=requirement`).

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

**Rules for every row.** A row says only what its text (and, when given, its previous message) says. Each example
stands alone: there is no hidden page, tab or memory behind it. `tools/check.mjs` refuses:

- a phrase key (`words`, `predicate`, `sort_words`, `name`, `description`, `count_words`, `code_words`,
  `measure_words`, the `text` of an unread wire) that is not copied exactly from the message, typos included;
- a target `ids` value the text does not say (a page id), a context wire (an object of the page) or a `thing` link. Whatever the text says about an object is written on the
  target or constraint (its kind, name, code words); anything more (another name, an id, a size) is a page state the
  text does not give;
- a constraint without `words` whose value is not in the text (the value must then be words of the text);
- `goes_to`: the tab is given by the file's folder, not by anything the text says;
- a key that repeats another (`words` equal to the whole message, `sort_words` equal to `sort`, a constraint's `words`
  equal to its `value`).

It also warns, without refusing, about rows to rewrite:

- an existing target nothing in the row identifies ("make it shorter" with no previous message and no named object).
  Write such requests with the text that makes the referent clear: a previous message, or the object named;
- a target kind the text never says;
- a meaning left unread (an unread wire holding the request's whole words, or a request with only unread wires);
- a value that is a phrase the text does not say ("x inverted" for "invert the x axis"): a value is either words of the
  text or a value of a closed list (blue, near, left_of, much_more);
- a proper name of the text (a capitalised word not starting a sentence) that no wire of its request keeps.

## Checking new data

`sop-knowledge-worlds` must be cloned next to this repository (or pass `--knowledge DIR`):

```sh
node tools/check.mjs                              # every file (about a minute)
node tools/check.mjs --file diagram/new.csv       # one file
node tools/check.mjs --warnings rewrite.csv       # also list the rows to rewrite (text, sop, warning)
```

It prints how many rows pass, each kind of problem with a count and an example row, and the counts of warnings. The exit code is 1 when any
row fails. Fix the rows, or, when the data carries a real meaning the schema lacks, extend the schema in
sop-knowledge-worlds. Never bend the meaning to fit.

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

Known data issues (2026-11-23): all rows pass the checker; 62,443 rows carry a warning: 42,922 with an existing target
nothing in the row identifies, 34,371 with a meaning left unread, 9,691 with an invented value phrase, 5,156 with a
proper name the circuit loses, 1,173 with a kind the text never says (a row can have several). They are the first
candidates for rewriting. When the data moved here, the page contexts of the old rows (lists of objects with names and
ids the text does not say, up to 95 per row) and target ids the text does not say were dropped.

## Licence

MIT (see `LICENSE`).
