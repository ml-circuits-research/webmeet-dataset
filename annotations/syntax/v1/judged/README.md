# Judged syntax circuits

A formalizer reads one message and writes one circuit in the `syntax` schema of `soplang-nlu` (`soplang-nlu/docs/syntax-schema.md`, version 3). This folder holds the circuits that were accepted or rejected in that schema. A later run looks every circuit up here first and asks a judge only about the circuits this folder has not seen.

A circuit stands here for one of three reasons, and the line says which:

- a judge read it and accepted or rejected it;
- formalizers of at least three different families wrote it alike in a conversion round, so it was accepted by agreement, and no judge read it (`judge` is `agreement`);
- a judge wrote it, because no formalizer's circuit was accepted for the message (`source` is `judge`).

Circuits rewritten from the older `nlu` schema are in `../reference/` and count nowhere.

## The format

Each `*.jsonl` file holds one circuit per line.

| Field | Content |
| --- | --- |
| `text` | The message, exactly as in the dataset. |
| `sop` | The circuit, in the normal form described below. |
| `core` | `coreOf(text, sop)` of `soplang-nlu/lib/syntax.mjs`: what the circuit says, with the names and the order of its wires set aside. |
| `verdict` | `accepted` or `rejected`. |
| `grade` | `L8` for an accepted circuit. For a rejected one the failure level, `L1` to `L6`: L1 a wrong clause, L2 a word with content held as a discourse word, L3 words in the wrong wire or a wrong tie, L4 a statement the message does not make, L5 a missing clause, L6 something left untied. |
| `note` | The reason in one sentence. A judge's rejection quotes the words of the message. |
| `judge` | The model that judged, or `agreement` when the circuit was accepted because formalizers of several families wrote it alike. |
| `run` | The run or round that produced the line. It is also the name of the file. |
| `source` | Who wrote the circuit: the name of a formalizer, several names joined by `+` when several wrote the same circuit, or `judge` when a judge wrote it. |

Two circuits of one message are the same when their `core` is equal. A message can have several lines: several accepted circuits, since more than one reading can be right, and rejected ones. One of the accepted circuits is the label of the message, in `../labels.jsonl`.

The families of formalizers are declared in `soplang-nlu/tests/benchmark/syntax/strategies.mjs`. Formalizers of one family read a message from the same source (for example the same dependency parse), so only agreement across families settles a circuit; three families are asked for.

## The normal form

Two formalizers can write the same circuit with other wire names, another order of wires and keys, or with "next to" as one value or as two. Before a circuit is compared, shown to a judge or stored here, it is rewritten so that these differences disappear:

- wires are named `c` (clause), `n` (nominal), `r` (relation), `k` (coordination) with a number, in the order of their first word;
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
- `marker` and `conjunction` hold neighbouring words as one value;
- a clause lists its subject, then its complements; a relation `from`, then `to`.

The tools compute the core again from `text` and `sop` when they read this folder. The stored `core` is there for other readers.

## Who writes the files

The tools of `soplang-nlu/tests/benchmark/syntax/` write one new file for each run and never overwrite a file: `judge-publish.mjs` for a benchmark run, `round.mjs write` for a conversion round. The same call sets the labels in `../labels.jsonl`. The files are not edited by hand.

A circuit is decided once: when a line for a message and a core is already here, a later run keeps it and does not add a second one.
