# generated-glm-2026-11-28: generated messages (not real user data)

2,400 messages written on 2026-11-28 by GLM 5.3 (`zai-glm-5-3`, through the Mistral `vibe` CLI) from
`PROMPT-generate.txt`: 600 per area (calendar, diagram, document, drawing), aimed at constructions the syntax
formalizers get wrong (long lists, measures and pairings, order words, embedded questions, commands inside longer
sentences, nouns that look like verbs, typos, names and values after a noun).

They live in the syntactic layer only (no semantic file), as the owner decided on 2026-11-28: the syntactic layer is general. Use: a
check that repairs of the formalizers are general, and extra variety for training rvss. Treat them as placeholders
until real messages of the same kinds are found.

## The prompt

```text
You write test messages for a syntactic analyser. Work only in the current folder. Write ./generated-<area>.txt files, one message per line, plain English as a real user would type to an assistant that edits drawings, charts/diagrams, calendars and documents.

Write 600 messages per area (drawing, diagram, calendar, document) = 2,400 in total, deliberately covering constructions that analysers get wrong, spread evenly:
- long comma lists of things, some after a participle ("a girl kneeling by the pond, two ducks on the water, a cat and a dog under the tree");
- measures and pairings ("make it 160 wide and 100 high", "four blocks wide and five blocks tall", "x 120 y 40", "10^1 to 10^6");
- order and time words ("highest first", "then", "next", "instead", "again", "this time");
- embedded questions ("tell me where it is", "show what changed"), direct questions, "can you"/"could you" requests, "what if" and "I wonder if" suggestions with a command after them;
- commands inside longer sentences with semicolons, dashes and colons ("move the box — and that is all; then save it"), comments after a full stop ("That would help.", "Thanks!");
- a noun that looks like a verb and a verb that looks like a noun ("line Stove and Fridge up", "top the tower", "drop in an aqualung");
- typos and missing words as people really type ("pleese make the cloumns wider", "hvae the dog look at the cat");
- names and values after a noun ("set node Backup brown large", "heading Intro level 3 bold").
Vary length (3 to 45 words), tone and wording; no numbering, no quotes around lines, no explanations, no duplicates. Write the files in a few large writes, then count the lines with wc -l and fix the counts if needed.
```
