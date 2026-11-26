# Reviewed native NLU readings

Each JSONL record in `readings.jsonl` identifies one exact source text and its independently reviewed alternative SOP circuits. The native schema is version 1 in `soplang-nlu/schemas/nlu/schema.sop`. Matching preserves case and Unicode. Each reading names the strategies that emitted it, the frozen source revision, the evaluation run, the exact-candidate identity and the digest of its supporting review inventory. The corresponding `candidate-audit` directory in soplang-nlu contains individual source-based judgments and the evidence for inclusion.

The original CSV columns hold the historical w.request annotations. Native references are maintained separately and frozen by the benchmark parent before evaluation. A new publication of reviewed native readings can be used by later benchmark revisions. The run from which a reading was curated retains its historical grade.
