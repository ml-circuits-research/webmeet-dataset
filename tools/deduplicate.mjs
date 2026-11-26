// license: CC0-1.0
// Dry-run or apply global exact-text CSV deduplication.
import {closeSync, fstatSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {parseHeader} from './rows.mjs'

function* csvRecords(source, file) {
  let offset = 0
  let line = 1
  while (offset < source.length) {
    const start = offset
    const startLine = line
    const values = []
    const raw = []
    for (;;) {
      const cellStart = offset
      let value
      if (source[offset] === '"') {
        for (;;) {
          offset = source.indexOf('"', offset + 1)
          if (offset === -1) throw Error(file + ':' + startLine + ': unterminated quoted cell')
          if (source[offset + 1] !== '"') break
          offset++
        }
        value = source.slice(cellStart + 1, offset).replaceAll('""', '"')
        for (const _ of value.matchAll(/\n/g)) line++
        offset++
        if (offset < source.length && !',\r\n'.includes(source[offset])) {
          throw Error(file + ':' + startLine + ': unexpected text after a quoted cell')
        }
      } else {
        while (offset < source.length && !',\r\n'.includes(source[offset])) {
          if (source[offset] === '"') throw Error(file + ':' + startLine + ': quote inside an unquoted cell')
          offset++
        }
        value = source.slice(cellStart, offset)
      }
      raw.push(source.slice(cellStart, offset))
      values.push(value)
      if (source[offset] !== ',') break
      offset++
    }
    const contentEnd = offset
    if (source[offset] === '\r') offset++
    if (source[offset] === '\n') offset++
    const eol = source.slice(contentEnd, offset)
    if (eol) line++
    yield {start, end: offset, line: startLine, values, raw, eol}
  }
}

export function readTable(source, path) {
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : ''
  source = source.slice(bom.length)
  const records = csvRecords(source, path)
  const header = records.next().value
  const columns = header?.values.slice() ?? []
  while (columns.length > 2 && columns.at(-1).trim() === '') columns.pop()
  const parsed = parseHeader(columns)
  if (!parsed.ok) throw Error(path + ':1: ' + parsed.why)
  return {path, source, bom, header, columns: columns.length, records}
}

export function recordCircuits(record, table) {
  const circuits = []
  for (let index = 1; index < record.values.length; index++) {
    const value = record.values[index]
    if (!value.trim()) continue
    if (index >= table.columns) {
      throw Error(table.path + ':' + record.line + ': populated cell in undeclared column ' + (index + 1))
    }
    circuits.push({value, raw: record.raw[index], index})
  }
  return circuits
}

export function* dataRecords(table) {
  for (const record of table.records) {
    if (record.values.length === 1 && record.values[0] === '') continue
    yield record
  }
}

const normalize = value => value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ')

export function headerWithWidth(table, width) {
  const cells = [...table.header.raw]
  for (let index = table.columns; index < width; index++) cells[index] = 'sop' + (index - 1)
  return cells.join(',') + table.header.eol
}

function applyChanges(table) {
  const changes = table.changes
  if (table.width > table.columns) {
    changes.unshift({start: table.header.start, end: table.header.end, replacement: headerWithWidth(table, table.width)})
  }
  const parts = [table.bom]
  let offset = 0
  for (const {start, end, replacement} of changes.sort((a, b) => a.start - b.start)) {
    parts.push(table.source.slice(offset, start), replacement)
    offset = end
  }
  parts.push(table.source.slice(offset))
  return parts.join('')
}

export function planDeduplication(files) {
  const groups = new Map()
  const tables = []
  let rowsBefore = 0
  let circuitCellsBefore = 0
  for (const [path, source] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const table = {...readTable(source, path), changes: []}
    table.width = table.columns
    tables.push(table)
    for (const record of dataRecords(table)) {
      rowsBefore++
      const text = record.values[0]
      const circuits = recordCircuits(record, table)
      circuitCellsBefore += circuits.length
      let group = groups.get(text)
      if (!group) {
        group = {table, record, circuits, unique: new Map()}
        groups.set(text, group)
      } else {
        table.changes.push({start: record.start, end: record.end, replacement: ''})
      }
      for (const circuit of circuits) {
        if (!group.unique.has(circuit.value)) group.unique.set(circuit.value, circuit.raw)
      }
    }
  }

  const normalized = new Map()
  let uniqueCircuits = 0
  let changedOwners = 0
  let blankPrimaryPromotions = 0
  for (const [text, {table, record, circuits, unique}] of groups) {
    uniqueCircuits += unique.size
    const key = normalize(text)
    if (!normalized.has(key)) normalized.set(key, [])
    normalized.get(key).push({text, file: table.path, line: record.line})
    if (!unique.size || (unique.size === circuits.length && circuits.every((circuit, i) => circuit.index === i + 1))) continue
    changedOwners++
    if (!record.values[1]?.trim()) blankPrimaryPromotions++
    const cells = [record.raw[0], ...unique.values()]
    table.width = Math.max(table.width, cells.length)
    for (let index = cells.length; index < record.raw.length; index++) {
      cells.push(record.values[index].trim() ? '' : record.raw[index])
    }
    table.changes.push({start: record.start, end: record.end, replacement: cells.join(',') + record.eol})
  }

  const changes = new Map()
  const seen = new Set()
  let circuitsAfter = 0
  for (const table of tables) {
    const output = table.changes.length ? applyChanges(table) : table.bom + table.source
    if (table.changes.length) changes.set(table.path, output)
    const checked = readTable(output, table.path)
    for (const record of dataRecords(checked)) {
      const text = record.values[0]
      const group = groups.get(text)
      const circuits = recordCircuits(record, checked)
      if (!group || seen.has(text) || group.table.path !== table.path ||
          JSON.stringify(circuits.map(c => c.value)) !== JSON.stringify([...group.unique.keys()]) ||
          circuits.some((circuit, index) => circuit.index !== index + 1)) {
        throw Error('Deduplication verification failed at ' + table.path + ':' + record.line)
      }
      seen.add(text)
      circuitsAfter += circuits.length
    }
  }
  if (seen.size !== groups.size || circuitsAfter !== uniqueCircuits) {
    throw Error('Deduplication verification failed to conserve exact texts and circuits.')
  }
  const normalizedOnly = [...normalized.values()].filter(variants => variants.length > 1)
  return {
    changes,
    summary: {
      files: tables.length, filesChanged: [...changes.keys()], rowsBefore, rowsAfter: seen.size,
      duplicateRowsRemoved: rowsBefore - seen.size, circuitCellsBefore, uniqueCircuits,
      duplicateCircuitCellsRemoved: circuitCellsBefore - uniqueCircuits, changedOwners, blankPrimaryPromotions,
      normalizedOnlyGroups: normalizedOnly.length, normalizedOnly
    }
  }
}

export function* csvPaths(directory, prefix = '') {
  for (const entry of readdirSync(join(directory, prefix), {withFileTypes: true})) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const path = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory()) yield* csvPaths(directory, path)
    else if (entry.isFile() && entry.name.endsWith('.csv')) yield path
  }
}

export function writeChanges(dataset, files, changes, operation = 'deduplicate') {
  const pending = new Map()
  try {
    for (const [relative, output] of changes) {
      const path = join(dataset, relative)
      const temporary = path + '.' + operation + '-' + randomUUID()
      const fd = openSync(temporary, 'wx', statSync(path).mode & 0o777)
      pending.set(path, temporary)
      try { writeFileSync(fd, output) } finally { closeSync(fd) }
    }
    const currentPaths = [...csvPaths(dataset)]
    if (currentPaths.length !== files.size || currentPaths.some(path => !files.has(path))) {
      throw Error('Dataset CSV paths changed while planning.')
    }
    for (const [relative, input] of files) {
      const path = join(dataset, relative)
      const fd = openSync(path, 'r')
      try {
        if (!fstatSync(fd).isFile() || !readFileSync(fd).equals(Buffer.from(input))) {
          throw Error('Dataset changed while planning: ' + relative)
        }
      } finally { closeSync(fd) }
    }
    // Changes follow owner order. Install each owner file before removing any
    // duplicate from a later file so an interrupted write preserves circuits.
    for (const [path, temporary] of pending) {
      renameSync(temporary, path)
      pending.delete(path)
    }
  } finally {
    for (const temporary of pending.values()) unlinkSync(temporary)
  }
}

function main(args) {
  let dataset
  let write = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log('Usage: node tools/deduplicate.mjs --dataset DIR [--write]')
      return
    }
    if (args[i] === '--dataset' && dataset === undefined && args[i + 1] && !args[i + 1].startsWith('--')) {
      dataset = resolve(args[++i])
    } else if (args[i] === '--write' && !write) write = true
    else throw Error('Unexpected argument: ' + args[i])
  }
  if (!dataset) throw Error('Specify the dataset with --dataset DIR.')
  const decoder = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true})
  const files = new Map()
  for (const path of csvPaths(dataset)) {
    try {
      files.set(path, decoder.decode(readFileSync(join(dataset, path))))
    } catch (error) {
      throw Error('Cannot read ' + path + ': ' + error.message)
    }
  }
  if (!files.size) throw Error('No dataset CSV files found in ' + dataset)
  const {changes, summary} = planDeduplication(files)
  if (write) writeChanges(dataset, files, changes)
  console.log(JSON.stringify({mode: write ? 'write' : 'dry-run', ...summary}, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)) } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
