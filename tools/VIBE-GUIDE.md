# Judging and generating with `vibe`: state and how to continue

Written 2026-11-28, when the Mistral `vibe` subscription ran out of budget ("Error: Vibe budget exhausted." for every
model). The owner expects it to renew in about two days. This page says what was done, what is left, and how to do the
rest much more cheaply.

## What was done with vibe

| Work | Result | Where |
| --- | --- | --- |
| Easy half (spaCy and hmm-rules write the same circuit), GLM 5.3 | 622 of 673 parts, 77,364 rows read, 690 flagged (0.89%): the easy half is about 99% clean | `soplang-nlu/eval-results/2026-11-28-vibe-batches/*/*-simple.pNN.verdicts.jsonl` |
| Pilot GLM / DeepSeek against Opus | easy rows: GLM close to Opus; hard rows: GLM catches only 61% of Opus's rejections | `soplang-nlu/eval-results/2026-11-28-vibe-pilot/`, `…-vibe-advanced-pilot/` |
| Hard half, level 1 (plan B) | DeepSeek V4.1 Flash 124 of 428 parts (14,135 rows, 9.4% rejected); GLM 36 of 428 (3,632 rows, 16.8% rejected) | `soplang-nlu/eval-results/2026-11-28-hard-half/level1/{deepseek,glm}/` |
| Dataset scout (Mistral Large 4, web) | found the corpora imported into `syntactic/general/` (CLINC150, SGD, SNIPS: 63,097 messages) | `syntactic/general/*/SOURCE.md` |
| Targeted messages (GLM) | 2,397 messages, typos corrected, in `syntactic/general/generated-glm-2026-11-28/`; 267 typo pairs moved to symbolic-spell | |
| General messages (mistral-medium, then Mistral Large) | ~20,000 messages over 22 topics, not yet quality-filtered; 10 topics of the first run were thrown away (the model wrote a random-template script) | `imported/_generate/` (not in git) |
| Typos in webmeet | candidates from symbolic-spell, verification partly done | `tools/spelling/` (see its README) |

## Why it was spent so fast

1. **Agentic runs, not batch calls.** Each part was a `vibe` session that read RULES.md, read the CSV, wrote the
   verdicts file, ran the checker and often retried: several model turns per part, each turn resending the growing
   context. For 600+ parts this multiplies the tokens by roughly 3–10 compared with one call per batch.
2. **The full RULES.md (several thousand words) in every part.**
3. **Up to ~15 jobs at once**, and two models on the same hard rows (plan B level 1).
4. **Wasted runs**: generation topics made by a script, and a first generation with deliberate typos.

## How to continue, cheaper

| Change | How | Expected saving |
| --- | --- | --- |
| **Batch calls instead of agent sessions** | One call per batch: a short rules digest plus 100–150 rows inline in the prompt, the answer is the JSONL verdicts in the reply (`vibe -p … --max-turns 1 --output text`, or the provider's API directly). A local script parses and checks the reply and resends only the rows that failed, never the whole batch. | 3–10× fewer tokens |
| **A rules digest** | 1–1.5k words: the L-grades table and the settled cases that matter for the batch's kind, instead of the whole RULES.md | 2–4× less input per call |
| **Flash models first** | `zai-glm-5-3-flash` and `deepseek-v4-1-flash-1017` for easy rows and for level 1; Mistral Large only for the scout and hard verification | several × cheaper per token |
| **One cheap model, not two, then measure** | Level 1 of the hard half: one flash model judges; Opus judges every rejection and a random 300 of its acceptances. Add the second model only if the measured misses are too many (> ~5% of acceptances wrong). Two models on every row was the plan-B default, not a measured need. | about half of level-1 cost |
| **At most 4 jobs; estimate on one batch first** | run one batch, read its token cost, then decide | no surprises |
| **Generation: "write every message yourself, no program"** in the first prompt, batches of 250 | | no second runs |

## What is left, in order of value

1. **Publish the easy half**: the 76,674 rows GLM accepted can become labels (judge = GLM, with the pilot's agreement
   numbers as the reason); the 690 flagged rows go to Opus.
2. **Finish the easy half**: 51 parts (`node tests/benchmark/syntax/vibe/run.mjs` skips finished parts).
3. **Hard half, level 1**: 304 parts with DeepSeek flash (the GLM run can stop: one model, see above), then
   `node tests/benchmark/syntax/vibe/tiers.mjs merge`; levels 2–4 (290 Opus packets) wait for the owner's choice of
   Claude agents or vibe.
4. **Typo verification in webmeet**: the unverified candidates in `tools/spelling/`, then `tools/spelling/apply.mjs`
   (both layers) and the pairs to `symbolic-spell/dataset/`.
5. **Quality filter of the ~20,000 generated messages** (`imported/_generate/`): one batch call per 200 messages,
   "keep only natural, sensible messages"; import the kept ones with `node tools/import-general.mjs`.
6. **Label the general messages** (`soplang-nlu/tests/benchmark/syntax/vibe/general.mjs`, spaCy and hmm-rules first,
   no model), then judge their easy and hard parts like webmeet's.
