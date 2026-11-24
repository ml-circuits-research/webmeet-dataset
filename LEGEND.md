# WebMeet formalisation grades · v1

Grade the selected reading against the user's message and the context actually available to the reader. Use one grade per row. **L3 + L4** is the percentage of reasonable readings. L3 and L4 distinguish two ways to succeed and carry equal weight.

| Grade | Meaning | Example |
| --- | --- | --- |
| **L0 – Fail** | No usable reading. The reader returns nothing, refuses, emits invalid SOP, or leaves the entire request unread. | “Make the circle blue” produces no request. |
| **L1a – Wrong intent** | The main action, question, or polarity changes. | “Delete the circle” becomes “create a circle.” |
| **L1b – Wrong target** | The action is plausible but affects the wrong object, recipient, or endpoint. | “Move A below B” moves B below A. |
| **L1c – Wrong detail or role** | The target and action are plausible but an explicit value, unit, relation, or its role is wrong. | “Make the red circle blue” selects blue and applies red. |
| **L1d – Invented instruction** | The reading adds a material action, condition or detail without support in the message or available context. | “Move A below B” also deletes B. |
| **L2 – Incomplete** | There is useful, correct meaning, but an essential part is missing. | “Create A and connect it to B” creates A and omits the connection. |
| **L3 – Identical to dataset** | The reading is reasonable and its SOP text matches the reference after line-ending normalization and trimming outer whitespace. | The same wires, identifiers and values are emitted. |
| **L4 – Reasonable alternative** | The main intent and essential details are preserved using a different representation or a defensible interpretation. | The same request uses different local wire identifiers, with all references preserved. |

## Decisions that keep reports comparable

- Judge meaning first. An identical but materially incorrect annotation and prediction receive the corresponding error grade for the prediction. Flag the annotation separately as **dataset error** and record what the message actually says. A good alternative alone is insufficient evidence of a dataset error.
- An ambiguous request can succeed. Preserve what is clear and identify the specific uncertainty, in the wire or through meaningful alternatives. If only the family of “Tickets per day” is unclear, retain its name and requested colour while leaving the family open. Dropping the colour is L2. Binding an invented object ID as certain is L1d.
- Distinguish contradiction from omission. A wrong stated value is L1c; a missing required value is L2. An unsupported extra value where the user gave none is L1d. A fragment that correctly identifies an action or target can earn L2. Merely echoing the input as unread is L0.
- For several errors, record the first applicable primary grade in the order **L0, L1a, L1b, L1c, L1d, L2**. For example, if the only requested action is replaced, use L1a; if the requested action is preserved and another is added, use L1d. Optional secondary tags do not count again. A correct alternative buried under a materially wrong first choice does not rescue it.
- Report percentages for all eight grades, including zeros, plus **reasonable total (L3 + L4)**. State the sample and whether the reader had only text or also app context. If only a random subset of the 1% holdout was reviewed, the denominator for the grades is that reviewed subset. Name the legend version; old L2+ reports need row-level reassessment to split them into L3 and L4.
