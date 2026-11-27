# Syntactic labels

This folder holds the same messages as `../semantic/`, each with its circuit in the `syntax` schema of `soplang-nlu` (clauses, nominals, relations and coordinations; the schema and its rules are in `soplang-nlu/docs/syntax-schema.md`).

A file here has the name and the place of its source file: `syntactic/drawing/style-01.csv` holds the messages of `semantic/drawing/style-01.csv`, in the same order, each message once.

| Column | Contents |
| --- | --- |
| `text` | The message, exactly as typed. |
| `sop` | Its circuit in the `syntax` schema, one wire per line. Empty when no circuit has been settled yet. |
| `source` | Who wrote the circuit: the names of the formalizers that wrote it, joined by `+`, or `judge` when a judge wrote it. |
| `accepted_by` | How the circuit was accepted: `agreement` (formalizers of different kinds wrote the same circuit), `judge` (a judge read and accepted it), `written` (a judge wrote it because no formalizer's circuit was acceptable), or empty. |

The files are filled in rounds. A round takes the next file of `semantic/` that has no file here, runs the formalizers on its messages, has a judge read the circuits that are not settled by agreement, and writes the file. A file is written only when its round is complete, so every file present here is whole.

The folder `../annotations/syntax/v1/` keeps what the judges decided: every circuit they accepted or rejected, and the label of each judged message.
