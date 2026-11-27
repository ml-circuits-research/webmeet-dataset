# What judges decided about syntax circuits

A formalizer reads one message and writes one circuit in the `syntax` schema of `soplang-nlu` (`soplang-nlu/docs/syntax-schema.md`, version 3). The circuit splits the message into clauses and nominals, gives every word one place, and ties the parts.

| Here | Content |
| --- | --- |
| `judged/` | Every circuit that a judge read, accepted or rejected, with the reason, and every circuit that a judge wrote. See its README. |
| `reference/` | Circuits rewritten by rule from the older `nlu` schema. No judge has read them in the `syntax` schema; they are kept for comparison and count nowhere. See its README. |

The files are written by the tools of `soplang-nlu/tests/benchmark/syntax/` and are not edited by hand.

## Where the labels are

The label of a message is the circuit that stands for it in this dataset. The labels are in `../../../syntactic/`, and nowhere else: the row of a message there holds its circuit in the `sop` cell, who wrote it in `source`, and how it was accepted in `accepted_by`. A message whose `sop` cell is empty has no label yet. See `../../../syntactic/README.md`.

A label is always a circuit that was accepted in the `syntax` schema, in one of three ways. The `accepted_by` cell says which:

| `accepted_by` | How the circuit was accepted | What this folder holds of it |
| --- | --- | --- |
| `judge` | A judge read it and accepted it. | The judge's line in `judged/`, with the judge's note. |
| `written` | A judge wrote it, because no formalizer's circuit was accepted for the message. | The line in `judged/`, with `source` "judge". |
| `agreement` | Formalizers that read the message from different sources wrote it alike, and no judge read it. | Nothing: the syntactic file is the only record. |

This folder used to hold a file `labels.jsonl` that repeated the labels, and lines in `judged/` that repeated the circuits settled by agreement. Both were removed on 2026-11-27, after a check that every one of them stood in the syntactic files. The tools compute what they need from the syntactic files: the core of a circuit, by which two circuits of one message are compared, is computed from the circuit when a message is looked up.

## How a label is set

1. A benchmark or a conversion round runs the formalizers over messages. A circuit equal to the label of its message needs no judge, whether a judge accepted that label or formalizers agreed on it.
2. In a conversion round, a circuit that formalizers of different families wrote alike is settled by agreement. A judge reads the other circuits and accepts or rejects each, and reads a random share of the agreed ones as a control. For a message that is left with no accepted circuit, a judge writes one.
3. When the results are published, the syntactic files are written:
   - `judge-publish.mjs`, for a benchmark run: every circuit a judge accepted in the run becomes the label of its message, whatever the row held before, also a circuit settled by agreement. Only the rows of these messages change.
   - `round.mjs write`, for a conversion round: the empty cells of the round's files are filled with the circuits the round settled.
   The same call writes into `judged/` what the judge decided.

A message has one label. When a judge accepts several circuits of one message in the same run, the label is the circuit most formalizers wrote, and among equals the first one in the judge's packets. The other accepted circuits stay in `judged/` as accepted: more than one reading of a message can be right, and a formalizer that writes one of them is not counted as wrong.

A syntactic file holds only the present label of each message. What a row held before is in the history of this repository.
