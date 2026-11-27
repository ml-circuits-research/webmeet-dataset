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

A later step fills empty cells and never changes a circuit that is already here. `accepted_by` says which step settled each circuit.

The folder `../annotations/syntax/v1/` keeps what the judges decided: every circuit they accepted or rejected, and the label of each judged message.
