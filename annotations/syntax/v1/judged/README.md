# Judged syntax circuits

A formalizer reads one message and writes one circuit in the `syntax` schema of `soplang-nlu` (`soplang-nlu/docs/syntax-schema.md`, version 3). This folder holds the circuits a judge has accepted or rejected. A later benchmark looks every circuit up here first and asks a judge only about the circuits this folder has not seen.

## The format

Each `*.jsonl` file holds one judged circuit per line.

| Field | Content |
| --- | --- |
| `text` | The message, exactly as in the dataset. |
| `sop` | The circuit, in the normal form described below. |
| `core` | `coreOf(text, sop)` of `soplang-nlu/lib/syntax.mjs`: what the circuit says, with the names and the order of its wires set aside. |
| `verdict` | `accepted` or `rejected`. |
| `grade` | `L8` for an accepted circuit. For a rejected one the failure level, `L1` to `L6`: L1 a wrong clause, L2 a word with content held as a discourse word, L3 words in the wrong wire or a wrong tie, L4 a statement the message does not make, L5 a missing clause, L6 something left untied. |
| `note` | The judge's reason in one sentence. A rejection quotes the words of the message. |
| `judge` | The model that judged. |
| `run` | The run that produced the line. It is also the name of the file. |
| `source` | Who wrote the circuit: the name of a strategy, several names joined by `+` when several strategies wrote the same circuit, or `reference`. |

Two circuits of one message are the same when their `core` is equal. A message can have several lines: several accepted circuits, since more than one reading can be right, and rejected ones.

## The normal form

Two formalizers can write the same circuit with other wire names, another order of wires and keys, or with "next to" as one value or as two. Before a circuit is compared, shown to a judge or stored here, it is rewritten so that these differences disappear:

- wires are named `c` (clause), `n` (nominal), `r` (relation), `k` (coordination) with a number, in the order of their first word;
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
- `marker` and `conjunction` hold neighbouring words as one value;
- a clause lists its subject, then its complements; a relation `from`, then `to`.

The tools compute the core again from `text` and `sop` when they read this folder. The stored `core` is there for other readers.

## Who writes the files

The files are written by tools of `soplang-nlu/tests/benchmark/syntax/` and are not edited by hand.

- `judge-publish.mjs` writes one new file for each judged run and never overwrites a file.
- `convert-nlu.mjs` writes `reference-nlu-v1.jsonl`. Calling it again writes that file again from the `nlu` registry.

## The reference circuits

`reference-nlu-v1.jsonl` holds circuits rewritten by rule from the `nlu` circuits that judges accepted (`../../../nlu/v1/judged/`). The rules are the table "How it relates to the `nlu` schema" of `soplang-nlu/docs/syntax-schema.md`. Their lines have `source` "reference", `verdict` "accepted", `grade` "L8", and a `run` that starts with `convert-nlu:` followed by the `nlu` run the circuit comes from. `judge` names the model that accepted the `nlu` circuit.

No judge has read these circuits in the `syntax` schema. They count as accepted until a judge does. When a judge later reads one, the judge's line stands in the file of that run with `source` "reference", and it counts before the line of this file.

| What | Count |
| --- | ---: |
| Accepted `nlu` circuits | 2,487 |
| Rewritten | 2,290 |
| Distinct syntax circuits, the lines of the file | 2,107 |
| Messages of the 1% sample that have at least one | 1,690 of 1,831 |
| Not rewritten | 197 |

A circuit is rewritten only when the rules settle every word. The 197 others were left out for these reasons:

| Reason | Circuits |
| --- | ---: |
| A clause starts with "and", "then" or "so" and no coordination joins it to an earlier clause | 86 |
| A fragment stands after a clause with a verb in one coordination, and an `nlu` circuit does not say whether it shares that verb | 38 |
| An expression of several words ("while you're at it", "same idea"), whose grammar the `nlu` circuit does not give | 28 |
| A clause has a marker ("to", "before") and no relation ends at it | 27 |
| A question of several words ("what about", "how far") | 11 |
| Other: repeated words that cross between wires (2), and one each of five rare cases | 7 |

The rejected `nlu` circuits were not rewritten.

## The files

| File | Lines | Accepted | Rejected |
| --- | ---: | ---: | ---: |
| `reference-nlu-v1.jsonl` | 2,107 | 2,107 | 0 |
