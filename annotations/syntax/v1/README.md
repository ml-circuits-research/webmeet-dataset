# Syntax circuits of the messages

A formalizer reads one message and writes one circuit in the `syntax` schema of `soplang-nlu` (`soplang-nlu/docs/syntax-schema.md`, version 3). The circuit splits the message into clauses and nominals, gives every word one place, and ties the parts. This folder holds what has been decided about such circuits.

| Here | Content |
| --- | --- |
| `labels.jsonl` | The label of each message: one accepted circuit. |
| `judged/` | Every circuit that was accepted or rejected, with who decided and why. See its README. |
| `reference/` | Circuits rewritten by rule from the older `nlu` schema. No judge has read them in the `syntax` schema; they are kept for comparison and count nowhere. See its README. |

The files are written by the tools of `soplang-nlu/tests/benchmark/syntax/` and are not edited by hand.

The folder `../../../syntactic/` holds the messages file by file, each with its circuit. A file there is written at the end of a conversion round, from the labels and the accepted circuits kept here.

## The labels

The label of a message is the circuit that stands for it in this dataset. It is always a circuit that was accepted in the `syntax` schema, in one of three ways:

- a judge read it and accepted it;
- formalizers of at least three different families wrote it alike, in a conversion round (agreement);
- a judge wrote it, because no formalizer's circuit was accepted for the message.

`labels.jsonl` has one line per message that has a label.

| Field | Content |
| --- | --- |
| `text` | The message, exactly as in the CSV files. |
| `label` | The accepted circuit, in the normal form described in `judged/README.md`. |
| `core` | What the circuit says, with the names and the order of its wires set aside. Two circuits of one message are the same when their cores are equal. |
| `run` | The run or round that set this label. The file `judged/<run>.jsonl` holds the line that says how the circuit was accepted. |
| `source` | The formalizers that wrote the circuit, joined by `+`, or `judge` when a judge wrote it. |
| `previous` | The core of the label this one replaced, or `null` when the message had no label. |

How a label comes about:

1. A benchmark or a conversion round runs the formalizers over messages. A circuit equal to the label of its message needs no judge.
2. In a conversion round, a circuit that formalizers of at least three different families wrote alike is settled by agreement. A judge reads the other circuits and accepts or rejects each. For a message that is left with no accepted circuit, a judge writes one.
3. When the results are published (`judge-publish.mjs`, or `round.mjs write` for a round), every circuit accepted in that run becomes the label of its message, whatever label the message had before. The line then names in `previous` the label it replaced.

A message has one label. When several circuits of one message are accepted in the same run, the label is the circuit most formalizers wrote, and among equals the first one in the judge's packets. The other accepted circuits stay in `judged/` as accepted: more than one reading of a message can be right, and a formalizer that writes one of them is not counted as wrong.

A message without a line has no label yet: no circuit has been accepted for it.

The file keeps only the present label of each message. Earlier labels can be found in `judged/`, by the message and the core in `previous`, and in the history of this repository.
