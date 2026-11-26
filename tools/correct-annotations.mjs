// license: CC0-1.0
// Apply adjudicated changes to existing WebMeet records identified by exact text.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cell } from './rows.mjs'
import { csvPaths, dataRecords, headerWithWidth, readTable, recordCircuits, writeChanges } from './deduplicate.mjs'

const auditVersion = 'webmeet-annotation-corrections-v1'
const sha256 = (contents) => createHash('sha256').update(contents).digest('hex')

function normalizeEdits(edits) {
  if (!Array.isArray(edits) || !edits.length) throw Error('Expected a nonempty array of adjudicated edits.')
  const byText = new Map()
  for (const {text, add, remove} of edits) {
    if (typeof text !== 'string' || !text.trim()) throw Error('Each edit requires a nonempty text string.')
    if (byText.has(text)) throw Error('Duplicate edit for exact text ' + JSON.stringify(text))
    for (const values of [add, remove]) {
      if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value.trim())) {
        throw Error('Expected add and remove arrays of nonempty SOP strings for ' + JSON.stringify(text))
      }
    }
    if (add.some((sop) => remove.includes(sop))) throw Error('Same SOP in both add and remove for ' + JSON.stringify(text))
    if (!add.length && !remove.length) throw Error('Add or remove at least one SOP for ' + JSON.stringify(text))
    byText.set(text, {text, add: new Set(add), remove: new Set(remove)})
  }
  return byText
}

function replaceText(source, patches, reverse = false) {
  let offset = 0
  const parts = []
  for (const patch of patches) {
    const start = reverse ? patch.afterOffset : patch.beforeOffset
    const previous = reverse ? patch.after : patch.before
    const replacement = reverse ? patch.before : patch.after
    if (!Number.isInteger(start) || start < offset || typeof previous !== 'string' ||
        typeof replacement !== 'string' || source.slice(start, start + previous.length) !== previous) {
      throw Error('Audit patch does not match the current CSV contents.')
    }
    parts.push(source.slice(offset, start), replacement)
    offset = start + previous.length
  }
  parts.push(source.slice(offset))
  return parts.join('')
}

export function planCorrections(files, edits) {
  const byText = normalizeEdits(edits)
  const matches = new Map()
  for (const [path, source] of files) {
    const table = {...readTable(source, path), width: 0, patches: []}
    table.width = table.columns
    for (const record of dataRecords(table)) {
      const text = record.values[0]
      if (!byText.has(text)) continue
      if (matches.has(text)) {
        const previous = matches.get(text)
        throw Error(`Exact text ${JSON.stringify(text)} is ambiguous at ${previous.table.path}:${previous.record.line} and ${path}:${record.line}`)
      }
      matches.set(text, {table, record})
    }
  }
  const changedTables = new Set()
  const judgments = []
  for (const [text, {add, remove}] of byText) {
    const match = matches.get(text)
    if (!match) throw Error('No record found for exact text ' + JSON.stringify(text))
    const {table, record} = match
    const circuits = recordCircuits(record, table)
    const present = new Set(circuits.map(({value}) => value))
    const added = [...add].filter((sop) => !present.has(sop))
    const removed = [...remove].filter((sop) => present.has(sop))
    judgments.push({text, path: table.path, line: record.line, added, removed, alreadyPresent: [...add].filter((sop) => present.has(sop)),
      alreadyAbsent: [...remove].filter((sop) => !present.has(sop))})
    if (!added.length && !removed.length) continue

    const data = [...record.raw]
    // Delete only explicitly adjudicated alternatives. Fill emptied slots before extending the record.
    const retained = []
    for (const circuit of circuits) {
      if (remove.has(circuit.value)) data[circuit.index] = ''
      else retained.push(circuit)
    }
    if (!retained.length && !added.length) throw Error('Correction would leave no primary SOP for ' + JSON.stringify(text))
    const occupied = new Set(retained.map(({index}) => index))
    if (!occupied.has(1) && retained.length) {
      const first = retained[0]
      data[1] = first.raw
      data[first.index] = ''
      occupied.delete(first.index)
      occupied.add(1)
    }
    for (const value of added) {
      let index = 1
      while (occupied.has(index)) index++
      data[index] = cell(value)
      occupied.add(index)
      table.width = Math.max(table.width, index + 1)
    }

    table.patches.push({
      start: record.start,
      end: record.end,
      replacement: data.join(',') + record.eol
    })
    changedTables.add(table)
  }

  const changes = new Map()
  const auditFiles = []
  for (const table of changedTables) {
    if (table.width > table.columns) {
      table.patches.push({start: table.header.start, end: table.header.end, replacement: headerWithWidth(table, table.width)})
    }
    let shift = 0
    const original = files.get(table.path)
    const patches = table.patches.sort((a, b) => a.start - b.start).map(({start, end, replacement}) => {
      const before = table.source.slice(start, end)
      const beforeOffset = table.bom.length + start
      const afterOffset = beforeOffset + shift
      shift += replacement.length - before.length
      return {beforeOffset, afterOffset, before, after: replacement}
    })
    const output = replaceText(original, patches)
    changes.set(table.path, output)
    auditFiles.push({path: table.path, beforeSha256: sha256(original), afterSha256: sha256(output), patches})
  }
  return {changes, audit: {version: auditVersion, judgments, files: auditFiles}}
}

export function planUndo(files, audit) {
  if (audit?.version !== auditVersion || !Array.isArray(audit.files)) throw Error('Invalid correction audit.')
  const changes = new Map()
  const seen = new Set()
  for (const {path, beforeSha256, afterSha256, patches} of audit.files) {
    if (seen.has(path) || !files.has(path)) throw Error('Invalid audit CSV path: ' + path)
    seen.add(path)
    const source = files.get(path)
    const currentSha256 = sha256(source)
    if (currentSha256 === beforeSha256) continue
    if (currentSha256 !== afterSha256) throw Error('CSV differs from the audit; cannot safely undo ' + path)
    if (!Array.isArray(patches)) throw Error('Invalid audit patches for ' + path)
    const original = replaceText(source, patches, true)
    if (sha256(original) !== beforeSha256) throw Error('Undo fingerprint mismatch for ' + path)
    changes.set(path, original)
  }
  return changes
}

function readEdits(path) {
  const source = readFileSync(path, 'utf8')
  if (!path.endsWith('.jsonl')) return JSON.parse(source)
  return source.split(/\r?\n/u).filter((line) => line.trim()).map((line) => JSON.parse(line))
}

function main(args) {
  if (args.includes('--help')) {
    console.log('Usage: node tools/correct-annotations.mjs --dataset DIR (--edits EDITS.json|EDITS.jsonl | --undo AUDIT.json) [--write]')
    return
  }
  let dataset, edits, undo, write
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    const next = args[index + 1]
    if (argument === '--dataset' && !dataset && next && !next.startsWith('--')) dataset = resolve(args[++index])
    else if (argument === '--edits' && !edits && next && !next.startsWith('--')) edits = args[++index]
    else if (argument === '--undo' && !undo && next && !next.startsWith('--')) undo = args[++index]
    else if (argument === '--write' && !write) write = true
    else throw Error('Unexpected or incomplete argument: ' + argument)
  }
  if (!dataset || Boolean(edits) === Boolean(undo)) throw Error('Specify --dataset and exactly one of --edits or --undo.')
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true})
  const files = new Map([...csvPaths(dataset)].sort().map((path) => [
    path, decoder.decode(readFileSync(join(dataset, path)))
  ]))
  const mode = write ? 'write' : 'dry-run'
  if (undo) {
    const audit = JSON.parse(readFileSync(undo, 'utf8'))
    const changes = planUndo(files, audit)
    if (write) writeChanges(dataset, files, changes, 'undo-corrections')
    console.log(JSON.stringify({mode, operation: 'undo', files: [...changes.keys()]}, null, 2))
  } else {
    const {changes, audit} = planCorrections(files, readEdits(edits))
    if (write) writeChanges(dataset, files, changes, 'correct-annotations')
    console.log(JSON.stringify({mode, operation: 'correct', ...audit}, null, 2))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)) } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
