# Batch formalization with soplang-nlu

Use the local strategy runner to obtain zero, one or two native SOP readings per English text. This path runs entirely on the machine and uses no reviewer subscription. Use the publication procedure below when producing reviewed dataset annotations.

## Set up a working directory

Use sibling checkouts of webmeet-dataset, soplang-nlu and sop-knowledge-worlds. The commands below start in the webmeet-dataset checkout and use Bash, Node.js 22+, Git, Python 3 and gzip. For the portable symbolic example, install SWI-Prolog and ensure `swipl` is available. The previously validated checkout combination uses soplang-nlu 1893a8f or later and sop-knowledge-worlds 3b2deeb. The library's strategy pages list prerequisites for the other engines.

```bash
export WEBMEET_DIR="$PWD"
export SOP_NLU_DIR="$(cd ../soplang-nlu && pwd)"
export SOP_KNOWLEDGE_DIR="$(cd ../sop-knowledge-worlds && pwd)"
export SOP_WORKSPACE="$(dirname "$WEBMEET_DIR")"
export SWIPL="$(command -v swipl)"
# Alternatively, set SWIPL to an installed executable or the sibling prolog-formaliser/tools/swipl.
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
export SOP_NLU_CURATION_JOBS=1 SOP_NLU_CURATION_MODEL=gpt-6-sol
export SOP_NLU_DRAFT_STRATEGY=prolog
export INVENTORY="$SOP_NLU_DIR/.local-runs/webmeet-sol-v1"
eco() { taskset -c 0,1 nice -n 15 ionice -c 3 "$@"; }
```

The scheduling prefix is for the shared Linux host. Choose two allowed logical CPUs on another Linux machine. Use a single process per batch. A second subscription on the same host still shares those CPUs.

## Run one local batch

Input is UTF-8 JSONL. Each record needs a distinct string ID and its original text. Compression is supported for both input and output. Only the text enters the strategy. An existing output file is protected against replacement.

```bash
demo=$(mktemp -d)
echo '{"id":"example-1","text":"Move the red circle."}' > "$demo/input.jsonl"
eco node tools/formalize-native-batch.mjs prolog "$demo/input.jsonl" "$demo/readings.jsonl.gz"
gzip -dc "$demo/readings.jsonl.gz"
```

The output includes each SOP string, source completeness, rejected-candidate count, per-request time and engine errors. A complete but wrongly attached clause can pass the static gate. Unreviewed output belongs in a working directory. To compare strategies, use the same input and a separate output for each. For example, `selector-distilbert` uses the selector's spaCy models and a trained ownership checkpoint. Configure the model paths described in soplang-nlu/docs/strategies/selector-distilbert.md. Plain Prolog works without those checkpoints.

## Select a WebMeet batch

The pinned inventory contains 183,094 distinct exact texts from commit 38ae0b563db2392bd7bfc5d11f6c2e9f4a0339bf. Development groups contain up to 500 texts. Four reserved groups contain 1,831 benchmark texts. Keep reserved groups out of generation for training, curation and model selection.

On the original machine reuse the existing inventory. On a second machine, copy its manifest and batches or reproduce them from committed data. The rebuild uses an empty destination and needs no model calls.

```bash
cd "$SOP_NLU_DIR"
if [ ! -f "$INVENTORY/manifest.json" ]; then
  eco node experiments/native-curation/plan.mjs "$INVENTORY" \
    eval-results/2026-11-26-distilbert-expanded-study-100/label-support/normal
fi
cmp "$INVENTORY/manifest.json" eval-results/2026-11-26-sol-native-curation/batch-manifest.json
```

Choose an assigned development batch. On the original handoff, groups 1–23 were published and groups 24–34 already had completed generation on disk. Check current state before spending on a batch. The example selects group 24. Run the local export only when a separate strategy output is wanted.

```bash
number=24
batch=$(printf '%06d' "$number")
python3 - "$INVENTORY/manifest.json" "$batch" <<'PY'
import json, sys
group = next(g for g in json.load(open(sys.argv[1]))["groups"] if g["number"] == sys.argv[2])
if group["usage"] != "development":
    raise SystemExit("Reserved evaluation batch")
print(group)
PY
# Optional local export of this exact group, from any working directory:
eco node "$WEBMEET_DIR/tools/formalize-native-batch.mjs" prolog \
  "$INVENTORY/batches/$batch.jsonl.gz" "$demo/$batch-prolog.jsonl.gz"
```

## Curate and publish one assigned batch on another subscription

The account running the Codex CLI needs access to the configured curator and reviewer models. Use that operator's own authenticated CLI on PATH and its own workspace. Copy the work directory for an interrupted batch along with the inventory to resume completed microrequests. Keep the same script, prompt, schema and model for a resumed generation. A new subscription can use the same pinned files. Assign disjoint batch numbers across machines. Filesystem locks coordinate workers sharing the same inventory; independent checkouts require explicit assignments and synchronization of published commits.

Run from soplang-nlu. Check the existing dataset shard first. The confirmation command creates local commits in both repositories. Keep native annotation paths clean and synchronize existing reviewed commits before publishing from another checkout.

```bash
cd "$SOP_NLU_DIR"
shard="$WEBMEET_DIR/annotations/nlu/v1/batches/2026-11-26-sol-$batch.jsonl"
if [ -f "$shard" ]; then
  echo "Already published: $shard"
else
  if [ ! -f "$INVENTORY/work/$batch/summary.json" ]; then
    eco python3 experiments/native-curation/curate-queue.py "$INVENTORY" --start "$number" --end "$number"
  fi
  prior=()
  if ((number <= 12)); then
    prior=(--prior "$SOP_NLU_DIR/eval-results/2026-11-26-distilbert-expanded-study-100/label-support/normal/review")
  fi
  eco python3 experiments/native-curation/confirm-batch.py "$INVENTORY" "$number" "$WEBMEET_DIR" --jobs 1 "${prior[@]}"
fi
eco python3 experiments/native-curation/progress.py "$WEBMEET_DIR" "$INVENTORY"
```

The generation stage fills missing drafts with the selected library strategy. The curator can retain, revise or replace a draft, or abstain. The 500-source group is split into smaller model requests and checkpoints. Confirmation runs the schema and complete-source gate, then obtains independent source-based judgments for eligible circuits. A third model handles disagreements and a sample of agreements. An exact previously settled source/circuit pair can reuse its vote. Publication requires two supporting votes and excludes a circuit with a contradictory audit. Each published row contains its provenance. The review evidence and unresolved sources live under soplang-nlu/eval-results/2026-11-26-sol-native-curation. The dataset shard is under annotations/nlu/v1/batches.

For a training experiment, choose the number of batches first and measure downstream performance on a held-out split after each tranche. Local generation for exploratory use ends after the local export. Publishing reviewed references uses the longer procedure. Keep experimental drafts and accepted references in separate files.

## See which CSVs have native readings

Run from webmeet-dataset with `SOP_NLU_DIR` and `SOP_KNOWLEDGE_DIR` set.

```bash
eco node tools/native-coverage.mjs HEAD > /tmp/webmeet-native-coverage.json
```

The report reads the chosen Git commit. Every CSV keeps its original application annotations. Native readings are stored separately and joined to the CSV rows by exact source text, preserving case and Unicode. A moved row keeps its native coverage. A changed text needs a new exact match. Local edits to CSVs and native registries are outside the committed report.

- `legacy-only` means the file has no matching native rows. `partial` means some rows lack native readings or have readings that fail current checks. `native-complete` means every row has native readings and every stored alternative passes.
- `nativeCurrent` counts rows whose stored alternatives all pass the current schema and full-source checks. `nativeNeedsRecheck` counts rows where at least one native alternative fails.
- `withoutDirectAuditDigest` counts native rows with an alternative lacking a matching identity and direct audit digest. Some older corrections use a curation and supersession record instead. The report reruns static checks and records the exact library, knowledge and schema versions. Review judgments remain in each reading's provenance and its associated archive.

The [first coverage snapshot](COVERAGE-2026-11-26.json) records all 100 CSV files.

## Convert pending files with Vibe and DeepSeek Flash

Use an authenticated Vibe CLI with model alias `deepseek-v4-1-flash-1017`. The command runs headless without tool access or interactive permission prompts. It sends up to 24 texts per request by default. Set the group and request sizes to match the source files and measured model performance. If a group already has local drafts, the converter supplies them where available. Each circuit passes the current schema and source checks before being exported. A failed result is recorded for rework. Each input receives one model pass. The local verifier checks schema and source coverage. Requests can retry once after a transport failure.

```bash
cd "$SOP_NLU_DIR"
export VIBE_QUEUE="$SOP_NLU_DIR/.local-runs/webmeet-vibe-conversion"
eco python3 experiments/native-curation/vibe-queue.py "$INVENTORY" "$WEBMEET_DIR" "$VIBE_QUEUE" --plan-only
eco python3 experiments/native-curation/vibe-queue.py "$INVENTORY" "$WEBMEET_DIR" "$VIBE_QUEUE"
```

Add `--limit 1` to stop after one unfinished group. To resume, rerun using the same queue, model, schema and tool revision. Run one coordinator per queue. The plan skips exact texts with reviewed native references and the reserved evaluation cohort. It records the source and annotation revisions and assigns the remaining texts by source CSV. The output is committed under `annotations/nlu/v1/conversions/vibe/`. Each record includes the exact source, model, current schema and validator digests and a status of `static-pass` or `rework`. These files are separate from the independently reviewed reference registry. The benchmark continues to use its frozen references.

Rerun the coverage command after conversion commits. The per-file fields `convertedStatic`, `conversionRework` and `pendingConversion` split rows that are outside the reviewed registry. This lets you track conversion progress even while the reviewed-reference status of a CSV stays the same.

Send one request at a time, with multiple independent rows in its JSON payload. Use `--batch-rows 48` to set the request width for new groups. A resumed group retains its manifest width and completed request checkpoints. Each request includes the native schema, interpretation rules, the exact input texts and any available drafts. The headless invocation exposes no tools, so the model works from that payload. The context also contains validated examples of core roles, relations, control complements and interrupted utterances. Set `--group-rows 5000` or `--group-rows 10000` on a new queue to publish whole CSVs up to that size and `--batch-rows N` to set the maximum request width. The two limits are independent. The queue commits each checked group and pauses before the next group if first-pass coverage falls below 90% by default. Measure completed rows per minute and schema and source coverage across representative files before increasing the request width.

The corpus release decision uses the separate 90% plausibility target. Static coverage is checked on every row. Inspect a source-based sample for incorrect assignments even among static passes, and record defective rows for targeted correction. Establish feasible request width by checking the returned indices, timings and output quality.

To roll out only on a file whose conversion pilot meets the plausibility target, create a new queue with `--source-file document/text-01.csv` (or another exact dataset-relative CSV path). Keep that same option when resuming the queue. Check the first production group with `--limit 1` before continuing across the file. Committed, statically checked pilot conversions are skipped by the new plan.

To plan the same workflow with GPT-6.2 Sol, use `--backend sol`, a fresh queue directory and an explicit `--batch-rows` value. Sol also receives one request at a time. Each request requires a result for every input row. The queue writes Sol shards under `annotations/nlu/v1/conversions/sol/` and skips exact texts already found in either backend's committed shards. Choose one queue for a given corpus partition to avoid overlapping publication.
