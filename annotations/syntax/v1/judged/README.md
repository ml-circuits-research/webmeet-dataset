# Judged syntax circuits

A formalizer reads one message and writes one circuit in the `syntax` schema of `soplang-nlu` (`soplang-nlu/docs/syntax-schema.md`, version 3). This folder holds what a judge decided about such circuits:

- a circuit that a judge read, with the verdict: accepted or rejected, and the reason;
- a circuit that a judge wrote, because no formalizer's circuit was accepted for the message (`source` is `judge`).

A later run looks every circuit up here first and asks a judge only about circuits that have no verdict yet.

What no judge decided is not here. A circuit that formalizers wrote alike, and that was settled by that agreement, stands in the syntactic file of its message (`../../../syntactic/`), where the `accepted_by` cell says `agreement`. When a judge later reads such a circuit as a control, the judge's verdict gets a line here like any other.

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
| `note` | The reason in one sentence. A rejection quotes the words of the message. |
| `judge` | The model that judged. |
| `run` | The run or round that produced the line. It is also the name of the file. |
| `source` | Who wrote the circuit: the name of a formalizer, several names joined by `+` when several wrote the same circuit, or `judge` when a judge wrote it. |
| `supersedes` | Only on a line that publishes a circuit judged again after the judges' rules changed: the name of the file in this folder whose line for the same message and core it replaces. |

Two circuits of one message are the same when their `core` is equal. A message can have several lines: several accepted circuits, since more than one reading can be right, and rejected ones. The label of the message is the circuit in its row of the syntactic files.

## Twenty lines that are no verdict of a judge

`2026-11-27-round-02.jsonl` still holds 20 lines whose `judge` is `agreement`. In that round, two groups of formalizers each agreed on a different circuit for the same message. The syntactic file holds one of the two as the label. The other is recorded only by these lines, so they were kept when the lines that repeated the syntactic files were removed on 2026-11-27. The tools still read them as accepted circuits. A judge can settle them, or they can be removed.

## The normal form

Two formalizers can write the same circuit with other wire names, another order of wires and keys, or with "next to" as one value or as two. Before a circuit is compared, shown to a judge or stored, it is rewritten so that these differences disappear:

- wires are named `c` (clause), `n` (nominal), `r` (relation), `k` (coordination) with a number, in the order of their first word;
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
- `marker` and `conjunction` hold neighbouring words as one value;
- a clause lists its subject, then its complements; a relation `from`, then `to`.

The tools compute the core again from `text` and `sop` when they read this folder. The stored `core` is there for other readers.

## Who writes the files

The tools of `soplang-nlu/tests/benchmark/syntax/` write one new file for each run that a judge worked on, and never overwrite a file: `judge-publish.mjs` for a benchmark run, `round.mjs write` for a conversion round. A run in which no judge decided anything writes no file here. The same call writes the labels into the syntactic files. The files are not edited by hand.

A circuit is decided once: when a line for a message and a core is already here, a later run keeps it and does not add a second one. The exception is a circuit judged again because the judges' rules changed (`rejudge.mjs`): its new verdict gets a line in a new file, with `supersedes` naming the file of the line it replaces, and the old line stays. For a message and a core the tools read the line that no other line supersedes; of several such lines, the one with the longest chain of `supersedes` behind it; of lines still equal, the first in the order of the file names. The order of the files matters only when no line supersedes another.
