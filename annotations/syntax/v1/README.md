# Syntax circuits of the messages

A formalizer reads one message and writes one circuit in the `syntax` schema of `soplang-nlu` (`soplang-nlu/docs/syntax-schema.md`, version 3). The circuit splits the message into clauses and nominals, gives every word one place, and ties the parts. This folder holds what judges have decided about such circuits.

| Here | Content |
| --- | --- |
| `labels.jsonl` | The label of each message: one accepted circuit. |
| `judged/` | Every circuit a judge accepted or rejected, with the reason. See its README. |
| `reference/` | Circuits rewritten by rule from the older `nlu` schema. No judge has read them in the `syntax` schema; they are kept for comparison and count nowhere. See its README. |

The files are written by the tools of `soplang-nlu/tests/benchmark/syntax/` and are not edited by hand.

## The labels

The label of a message is the circuit that stands for it in this dataset: a circuit that a judge accepted in the `syntax` schema.

`labels.jsonl` has one line per message that has a label.

| Field | Content |
| --- | --- |
| `text` | The message, exactly as in the CSV files. |
| `label` | The accepted circuit, in the normal form described in `judged/README.md`. |
| `core` | What the circuit says, with the names and the order of its wires set aside. Two circuits of one message are the same when their cores are equal. |
| `run` | The judged run that set this label. The file `judged/<run>.jsonl` holds the judge's line for the circuit. |
| `source` | The strategies that wrote the circuit, joined by `+`. |
| `previous` | The core of the label this one replaced, or `null` when the message had no label. |

How a label comes about:

1. A benchmark runs the strategies over a sample of messages. A circuit equal to the label of its message needs no judge.
2. A judge reads the other circuits and accepts or rejects each.
3. When the verdicts are published (`judge-publish.mjs`), every accepted circuit becomes the label of its message, whatever label the message had before. The line then names in `previous` the label it replaced.

A message has one label. When a judge accepts several circuits of one message in the same run, the label is the circuit most strategies wrote, and among equals the first one in the judge's packets. The other accepted circuits stay in `judged/` as accepted: more than one reading of a message can be right, and a strategy that writes one of them is not counted as wrong.

A message without a line has no label yet: no judge has accepted a circuit for it.

The file keeps only the present label of each message. Earlier labels can be found in `judged/`, by the message and the core in `previous`, and in the history of this repository.
