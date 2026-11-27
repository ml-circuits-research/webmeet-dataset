# Judged readings

Each file holds the verdicts of one judged run on syntactic `nlu` circuits. A line is one message of the dataset.

| Field | Content |
| --- | --- |
| `id`, `text` | The message, by its place in the CSV files and by its exact text. |
| `accepted` | Circuits a judge accepted for this text. `source` says where each came from: `vss` (a reader's output), `reviewed:…` or `draft:…` (a circuit this dataset already held), `judge` (written by the judge when nothing else was acceptable). |
| `rejected` | Circuits a judge rejected, each with its `grade` on the L0–L10 legend, or `defect` for a circuit this dataset already held. |
| `standard` | The rules the judge worked by. `strict` asks for the full reading a careful reader gives. `plausible` accepts a faithful partial reading that marks what it leaves open. |
| `judge`, `run`, `note` | The judging model, the run and the judge's one-line reason. |

A circuit accepted under any standard stays accepted. A rejection counts only under the standard it was made by. Every accepted circuit passes the static check of `soplang-nlu`: it is valid against the `nlu` schema and every word of the text stands in one wire.

The files are written by `soplang-nlu/strategies/vss/judged.mjs`. A later run of a reader costs a judgment only for the circuits these files have not seen, so the share of readings that can be compared without a judge grows with every run.

| Run | Texts | Accepted circuits | Rejected circuits |
| --- | ---: | ---: | ---: |
| `2026-11-27-vss-03f9abe-strict` | 1,831 (the fixed 1% sample) | 2,216 | 1,154 |
| `2026-11-27-vss-346876e-plausible` | 912 (the texts of the sample whose readings were not yet accepted) | 197 | 830 |
