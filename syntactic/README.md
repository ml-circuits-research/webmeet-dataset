# Syntactic labels

This folder holds the same messages as `../semantic/`, each with its circuit in the `syntax` schema of `soplang-nlu` (clauses, nominals, relations and coordinations; the schema and its rules are in `soplang-nlu/docs/syntax-schema.md`).

A file here has the name and the place of its source file: `syntactic/drawing/style-01.csv` holds the messages of `semantic/drawing/style-01.csv`, in the same order, each message once. The two folders are mirrors: same paths, same messages, same order. `node tools/layers.mjs check` checks it, with no language model. A file holds at most 1,000 messages; a larger source is split into parts `<name>.01.csv`, `<name>.02.csv`, … in both folders.

| Column | Contents |
| --- | --- |
| `text` | The message, exactly as typed. |
| `sop` | Its circuit in the `syntax` schema, one wire per line. Empty when no circuit has been settled yet. |
| `source` | Who wrote the circuit: the names of the formalizers that wrote it, joined by `+`, or `judge` when a judge wrote it. |
| `accepted_by` | How the circuit was accepted: `agreement` (formalizers that read the message from different sources wrote the same circuit, up to where a phrase with a linking word attaches; no judge read it), `judge` (a judge read and accepted it), `written` (a judge wrote it because no formalizer's circuit was acceptable), or empty when the message has no circuit yet. |

Every file of `semantic/` has its file here. A file is filled in steps, and a message whose circuit is not settled yet has an empty `sop` cell:

1. Formalizers that read a message from different sources write a circuit for every message. A circuit that they wrote alike is settled by agreement and written here without a judge having read it; a judge reads a random share of these circuits as a control (on 2026-11-27: 1,154 read, 10 rejected).
2. For the other messages a judge reads one circuit, and the circuit is written here when the judge accepts it.
3. Where the judge rejects it, a judge writes the circuit.

A later step of the conversion fills empty cells and does not change a circuit that is already here. `accepted_by` says which step settled each circuit.

## The only store of labels

The circuit in the `sop` cell is the label of its message. These files are the only place where the labels are kept: no other file repeats them. A circuit settled by agreement is recorded here alone, by `accepted_by`.

The tools of `soplang-nlu/tests/benchmark/syntax/` read the labels from these files and write them here:

- A conversion round (`round.mjs write`) fills the empty cells of its files.
- A benchmark run draws a sample of messages across many files. When its verdicts are published (`judge-publish.mjs`), every circuit a judge accepted in the run becomes the label of its message: the cells `sop`, `source` and `accepted_by` ("judge") of that row are set. This replaces what the row held, also a circuit settled by agreement: a judge's word counts before agreement. Only the files that change are written, and in them only the rows of these messages; the order of the rows, the line ends and the message cells stay as they are, so the mirror with `semantic/` holds.

The core of a circuit, by which two circuits of one message are compared, is not stored. The tools compute it from the circuit when they look a message up.

The folder `../annotations/syntax/v1/judged/` keeps what the judges decided: every circuit a judge read, accepted or rejected, with the reason, and every circuit a judge wrote. A row whose `accepted_by` is `judge` or `written` has its line there.
