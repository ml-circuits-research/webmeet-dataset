# Judged syntax circuits

A formalizer reads one message and writes one circuit in the `syntax` schema of `soplang-nlu` (`soplang-nlu/docs/syntax-schema.md`, version 3). This folder holds the circuits that a judge has read in that schema, accepted or rejected. A later benchmark looks every circuit up here first and asks a judge only about the circuits this folder has not seen.

Only verdicts given in the `syntax` schema stand here. Circuits rewritten from the older `nlu` schema are in `../reference/` and count nowhere.

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
| `source` | The strategy that wrote the circuit, or several names joined by `+` when several strategies wrote the same circuit. |

Two circuits of one message are the same when their `core` is equal. A message can have several lines: several accepted circuits, since more than one reading can be right, and rejected ones. One of the accepted circuits is the label of the message, in `../labels.jsonl`.

## The normal form

Two formalizers can write the same circuit with other wire names, another order of wires and keys, or with "next to" as one value or as two. Before a circuit is compared, shown to a judge or stored here, it is rewritten so that these differences disappear:

- wires are named `c` (clause), `n` (nominal), `r` (relation), `k` (coordination) with a number, in the order of their first word;
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
- `marker` and `conjunction` hold neighbouring words as one value;
- a clause lists its subject, then its complements; a relation `from`, then `to`.

The tools compute the core again from `text` and `sop` when they read this folder. The stored `core` is there for other readers.

## Who writes the files

`soplang-nlu/tests/benchmark/syntax/judge-publish.mjs` writes one new file for each judged run and never overwrites a file. The same call sets the labels in `../labels.jsonl`. The files are not edited by hand.

A circuit is judged once: when a line for a message and a core is already here, a later run keeps it and does not add a second one.
