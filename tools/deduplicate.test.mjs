import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'
import {planDeduplication} from './deduplicate.mjs'

test('keeps first global owner and all distinct alternatives with original multiline quoting', () => {
  const input = new Map([
    ['drawing/z.csv', 'text,sop,sop1\n"line, ""one""\nline two","sop, B",A\n"keep this",K'],
    ['calendar/a.csv', '\uFEFF"text",sop,\r\n"line, ""one""\nline two",A,\r\n"UNTOUCHED",U,\r\n']
  ])
  const {changes, summary} = planDeduplication(input)
  assert.equal(changes.get('calendar/a.csv'),
    '\uFEFF"text",sop,sop1\r\n"line, ""one""\nline two",A,"sop, B"\r\n"UNTOUCHED",U,\r\n')
  assert.equal(changes.get('drawing/z.csv'), 'text,sop,sop1\n"keep this",K')
  assert.equal(summary.duplicateRowsRemoved, 1)
  assert.equal(summary.duplicateCircuitCellsRemoved, 1)
  assert.equal(summary.uniqueCircuits, 4)
  const output = new Map([...input].map(([file, text]) => [file, changes.get(file) ?? text]))
  assert.equal(planDeduplication(output).changes.size, 0)
})

test('compacts duplicate and sparse alternatives, promotes an annotated blank primary, and leaves a blank row untouched', () => {
  const path = 'example.csv'
  const input = 'text,sop,sop1,sop2,sop3\r\n' +
    'ordinary,A,,A,B\r\nannotated,,"X",,Y\r\nblank,,,,\r\n\r\n'
  const {changes, summary} = planDeduplication(new Map([[path, input]]))
  assert.equal(changes.get(path), 'text,sop,sop1,sop2,sop3\r\n' +
    'ordinary,A,B,,\r\nannotated,"X",Y,,\r\nblank,,,,\r\n\r\n')
  assert.equal(summary.blankPrimaryPromotions, 1)
  assert.equal(summary.rowsBefore, 3)
  assert.equal(summary.rowsAfter, 3)
})

test('reports normalized-only collisions without merging records', () => {
  const path = 'data.csv'
  const input = 'text,sop\n"  ＦＯＯ  bar ",A\nfoo bar,B\n'
  const {changes, summary} = planDeduplication(new Map([[path, input]]))
  assert.equal(changes.size, 0)
  assert.equal(summary.normalizedOnlyGroups, 1)
  assert.deepEqual(summary.normalizedOnly[0].map(row => row.text), ['  ＦＯＯ  bar ', 'foo bar'])
})

test('refuses malformed rows or nonblank undeclared columns', () => {
  const plan = source => planDeduplication(new Map([['data.csv', source]]))
  assert.throws(() => plan('text,sop\nexample,A,B\n'), /undeclared column 3/)
  assert.throws(() => plan('text,sop\n"unterminated,A\n'), /unterminated quoted cell/)
})

test('CLI dry run preserves bytes and --write applies only planned changes', () => {
  const folder = mkdtempSync(join(tmpdir(), 'webmeet-dedupe-'))
  try {
    const files = ['a.csv', 'b.csv', 'c.csv'].map(file => join(folder, file))
    const inputs = ['text,sop\r\nx,A\r\n', 'text,sop\nx,B\n', 'text,sop\nz,Z']
    files.forEach((file, index) => writeFileSync(file, inputs[index]))
    const entry = fileURLToPath(new URL('./deduplicate.mjs', import.meta.url))
    const run = (...args) => {
      const result = spawnSync(process.execPath, [entry, '--dataset', folder, ...args], {encoding: 'utf8'})
      assert.equal(result.status, 0, result.stderr)
      return JSON.parse(result.stdout)
    }
    assert.equal(run().duplicateRowsRemoved, 1)
    assert.deepEqual(files.map(file => readFileSync(file, 'utf8')), inputs)
    assert.deepEqual(run('--write').filesChanged, ['a.csv', 'b.csv'])
    assert.deepEqual(files.map(file => readFileSync(file, 'utf8')), ['text,sop,sop1\r\nx,A,B\r\n', 'text,sop\n', inputs[2]])
    assert.deepEqual(run('--write').filesChanged, [])
  } finally {
    rmSync(folder, {recursive: true, force: true})
  }
})
