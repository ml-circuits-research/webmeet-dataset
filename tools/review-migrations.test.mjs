import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedRetirements } from './review-migrations.mjs';

const old = '@c w.request.constraint request=$r attribute=drawn.holds value=carrying';
const replacement = '@c w.request.constraint request=$r attribute=drawn.holds value="a basket"';
const row = {file: 'drawing/test.csv', text: 'carry a basket', old, sop: replacement};
const entry = {file: row.file, text: row.text, remove: [old], require: [replacement]};
const approve = (plan = [entry], rows = [row]) => approvedRetirements(plan, [row.file], rows);

test('approval is limited to the exact reviewed row and old wire', () => {
  const other = {...row, text: 'carry an umbrella'};
  const result = approve([entry], [row, other]);
  assert.deepEqual([...result.get(row)], [old]);
  assert.equal(result.has(other), false);
  assert.equal(result.get(row).has(old + ' phase=selector'), false);
});
test('missing replacement or retained wrong effect is rejected', () => {
  assert.throws(() => approve([entry], [{...row, sop: ''}]), /replacement missing/);
  assert.throws(() => approve([entry], [{...row, sop: old + '\n' + replacement}]), /old wire retained/);
});
test('stale, changed and ambiguous source rows are rejected', () => {
  assert.throws(() => approve([entry], [{...row, old: replacement}]), /source missing/);
  assert.throws(() => approve([entry], [row, {...row}]), /ambiguous/);
});
test('unscoped and duplicate approvals are rejected', () => {
  assert.throws(() => approve([{...entry, require: []}]), /required replacement/);
  assert.throws(() => approve([{...entry, remove: [old + '\n' + replacement]}]), /exact removed/);
  assert.throws(() => approve([entry, entry]), /duplicate retirement/);
  assert.throws(() => approve([{...entry, file: 'another.csv'}]), /approves no rows/);
});
