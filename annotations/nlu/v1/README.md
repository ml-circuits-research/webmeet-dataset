# Reviewed native NLU readings

Each JSONL record in `readings.jsonl` identifies one exact source text and its independently reviewed alternative SOP circuits. The native schema is version 1 in `soplang-nlu/schemas/nlu/schema.sop`. Matching preserves case and Unicode. An emitted reading names the strategies that produced it, the frozen source revision, the evaluation run, the exact-candidate identity and the digest of its supporting review inventory. The corresponding `candidate-audit` directory in soplang-nlu contains individual source-based judgments and the evidence for inclusion.

The original CSV columns hold the historical w.request annotations. Native references are maintained separately and frozen by the benchmark parent before evaluation. A new publication of reviewed native readings can be used by later benchmark revisions. The run from which a reading was curated retains its historical grade.

Curated corrections use a new circuit identity. The review records the reason and the superseded review, and originEngines identifies the producers of the earlier circuit. Importing the historical inventory again preserves the correction.

The files in `batches/*.jsonl` extend the original registry with independently reviewed native readings. Each exact source occurs in one registry file. A batch records its source revision and row ID, curator, and the hash of the supporting per-circuit judgments archived in soplang-nlu. A single source can have two distinct readings when its wording supports both. The full-source schema and grounding checks run before publication.

The [batch formalization guide](BATCH-HOWTO.md) covers local strategy inference, resuming a 500-source group on another subscription, and publishing independently reviewed native annotations.
