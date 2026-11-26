import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {planCorrections, planUndo} from './correct-annotations.mjs'
import {readRecords} from './rows.mjs'

const path = 'examples.csv'
const original = '\uFEFF"text","sop","sop1","sop2"\r\n"Move É, then",wrong,"keep\r\nSOP",""\r\nmove é,unrelated\nuntouched,"extra, quotes"'
const edit = {text: 'Move É, then', remove: ['wrong'], add: ['new\nSOP', 'alternate two', 'alternate three']}

test('preserves exact text, existing alternatives and other rows while expanding the header', () => {
  const {changes, audit} = planCorrections(new Map([[path, original]]), [edit])
  const result = changes.get(path)
  assert.equal(result,
    '\uFEFF"text","sop","sop1","sop2",sop3\r\n"Move É, then","keep\r\nSOP","new\nSOP",alternate two,alternate three\r\nmove é,unrelated\nuntouched,"extra, quotes"')
  const row = readRecords(result.slice(1)).records[0]
  assert.equal(row.text, edit.text)
  assert.deepEqual(row.circuits.map(({sop}) => sop), ['keep\r\nSOP', 'new\nSOP', 'alternate two', 'alternate three'])
  assert.equal(planCorrections(changes, [edit]).changes.size, 0)
  assert.equal(planUndo(changes, audit).get(path), original)
  assert.equal(planUndo(new Map([[path, original]]), audit).size, 0)
  assert.throws(() => planUndo(new Map([[path, result + '\n']]), audit), /differs from the audit/)
})

test('refuses absent or ambiguous exact texts and removal of the only reading', () => {
  const files = new Map([[path, 'text,sop\nOne,note\n']])
  assert.throws(() => planCorrections(files, [{text: 'one', add: ['read'], remove: []}]), /No record found/)
  assert.throws(() => planCorrections(files, [{text: 'One', add: [], remove: ['note']}]), /no primary SOP/)
  files.set('duplicate.csv', 'text,sop\nOne,other\n')
  assert.throws(() => planCorrections(files, [{text: 'One', add: ['read'], remove: []}]), /examples.csv:2 and duplicate.csv:2/)
})

test('CLI dry-run, write and undo round-trip without touching unrelated bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'webmeet-corrections-'))
  try {
    const csv = join(dir, path)
    const edits = join(dir, 'edits.jsonl')
    const audit = join(dir, 'audit.json')
    writeFileSync(csv, original)
    writeFileSync(edits, JSON.stringify(edit) + '\n')
    const executable = fileURLToPath(new URL('./correct-annotations.mjs', import.meta.url))
    const run = (...args) => {
      const result = spawnSync(process.execPath, [executable, '--dataset', dir, ...args], {encoding: 'utf8'})
      assert.equal(result.status, 0, result.stderr)
      return JSON.parse(result.stdout)
    }
    assert.equal(run('--edits', edits).mode, 'dry-run')
    assert.equal(readFileSync(csv, 'utf8'), original)
    const applied = run('--edits', edits, '--write')
    assert.equal(applied.files.length, 1)
    writeFileSync(audit, JSON.stringify(applied))
    assert.deepEqual(run('--edits', edits, '--write').files, [])
    assert.deepEqual(run('--undo', audit, '--write').files, [path])
    assert.equal(readFileSync(csv, 'utf8'), original)
    assert.deepEqual(run('--undo', audit, '--write').files, [])
  } finally {
    rmSync(dir, {recursive: true, force: true})
  }
})
