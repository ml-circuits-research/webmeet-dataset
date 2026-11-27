# Reference circuits rewritten from the `nlu` schema

`reference-nlu-v1.jsonl` holds 2,107 circuits in the `syntax` schema. They were not written or judged in that schema. Each was obtained by rule from an `nlu` circuit that a language-model judge had accepted on 2026-11-27, under the rules for the `nlu` schema:

| Origin of the `nlu` circuit | Circuits accepted |
| --- | ---: |
| a reading of the VSS strategy | 1,320 |
| written by the judge when nothing else was acceptable | 589 |
| an automatic draft the dataset held | 525 |
| an earlier reviewed circuit the dataset held | 53 |

These circuits do not count as accepted in the `syntax` schema. The folder `../judged/` holds only circuits that a judge read in the `syntax` schema. This file is kept for comparison.
