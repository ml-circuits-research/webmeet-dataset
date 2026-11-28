// The two layers of the dataset, `semantic/` and `syntactic/`, kept as mirrors: the same paths, the
// same messages in the same order, different circuits. No language model is involved.
//
//   node tools/layers.mjs split [--max 100] [--dry]
//       Splits every file of semantic/ that holds more than --max messages into parts
//       <name>.01.csv, <name>.02.csv, … of at most --max messages each, in the order of the file.
//       Every part repeats the header. The bytes of every row are kept as they are: the header
//       followed by the rows of all parts is the original file, and this is checked before the
//       original is removed. A file of syntactic/ with the same path is split at the same rows.
//   node tools/layers.mjs check
//       Checks the mirror: every file of syntactic/ outside syntactic/general/ has a file of semantic/ with the same path,
//       and both hold the same messages in the same order. Prints what differs and exits with 1.
import {existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LAYERS = {semantic: join(root, 'semantic'), syntactic: join(root, 'syntactic')}

/** The rows of a CSV text as they are written, each with its line ending; a line break inside quotes does not end a row. */
export function rawRows(text) {
  const rows = []
  let start = 0, quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') quoted = !quoted
    else if (c === '\n' && !quoted) { rows.push(text.slice(start, i + 1)); start = i + 1 }
  }
  if (start < text.length) rows.push(text.slice(start))
  return rows
}

/** The first cell of a row as written, unquoted: the message. */
export function firstCell(row) {
  if (!row.startsWith('"')) { const end = row.search(/[,\r\n]/u); return end < 0 ? row : row.slice(0, end) }
  let cell = ''
  for (let i = 1; i < row.length; i++) {
    if (row[i] !== '"') cell += row[i]
    else if (row[i + 1] === '"') { cell += '"'; i++ } else break
  }
  return cell
}

/** The parts of a file: [[header, ...rows]] with at most `max` rows after the header. */
export function partsOf(rows, max) {
  const [header, ...body] = rows
  const parts = []
  for (let at = 0; at < body.length; at += max) parts.push([header, ...body.slice(at, at + max)])
  return parts
}

const csvFiles = dir => existsSync(dir) ? readdirSync(dir).flatMap(name => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? csvFiles(path) : name.endsWith('.csv') ? [path] : []
}).sort() : []
const partName = (file, k) => file.replace(/\.csv$/u, '.' + String(k + 1).padStart(2, '0') + '.csv')
// the last row of a part ends with a line break, also when it was the last row of a file that did not
const closed = (rows, newline) => rows.map((row, k) => k === rows.length - 1 && !row.endsWith('\n') ? row + newline : row)

function split(max, dry) {
  let files = 0, made = 0
  for (const file of csvFiles(LAYERS.semantic)) {
    const text = readFileSync(file, 'utf8'), rows = rawRows(text)
    if (rows.length - 1 <= max) continue
    const newline = rows[0].endsWith('\r\n') ? '\r\n' : '\n'
    const parts = partsOf(rows, max)
    // nothing is lost and nothing changes: the header and the rows of the parts are the file
    const again = rows[0] + parts.map(part => part.slice(1).join('')).join('')
    if (again !== text) throw new Error('The parts of ' + file + ' do not give the file back')
    const mirror = join(LAYERS.syntactic, relative(LAYERS.semantic, file))
    let mirrorParts = null
    if (existsSync(mirror)) {
      const mirrorRows = rawRows(readFileSync(mirror, 'utf8'))
      if (mirrorRows.length !== rows.length || mirrorRows.some((row, k) => k && firstCell(row) !== firstCell(rows[k])))
        throw new Error(relative(root, mirror) + ' does not hold the messages of its semantic file in the same order; nothing was split')
      mirrorParts = partsOf(mirrorRows, max)
    }
    console.log(`${relative(root, file)}: ${rows.length - 1} messages -> ${parts.length} parts` + (mirrorParts ? ' (and its syntactic file)' : ''))
    files++; made += parts.length
    if (dry) continue
    parts.forEach((part, k) => writeFileSync(partName(file, k), closed(part, newline).join('')))
    unlinkSync(file)
    if (mirrorParts) { mirrorParts.forEach((part, k) => writeFileSync(partName(mirror, k), closed(part, newline).join(''))); unlinkSync(mirror) }
  }
  console.log(`${files} files over ${max} messages ${dry ? 'would be' : 'were'} split into ${made} parts. semantic/ ${dry ? 'would hold' : 'holds'} ${csvFiles(LAYERS.semantic).length + (dry ? made - files : 0)} files.`)
}

// syntactic/general/ holds messages of the syntactic layer only (public corpora, generated messages): it has no
// semantic file. The check keeps its files at most 100 messages and every text of syntactic/ unique.
const GENERAL = join(LAYERS.syntactic, 'general')
function check() {
  const problems = [], seen = new Map()
  for (const file of csvFiles(LAYERS.syntactic)) for (const [k, text] of rawRows(readFileSync(file, 'utf8')).slice(1).map(firstCell).entries()) {
    if (seen.has(text)) problems.push(`${relative(root, file)}: message ${k + 1} repeats a message of ${seen.get(text)}`)
    else seen.set(text, relative(root, file))
  }
  const general = existsSync(GENERAL) ? csvFiles(GENERAL) : []
  for (const file of general) {
    const n = rawRows(readFileSync(file, 'utf8')).length - 1
    if (n > 100) problems.push(`${relative(root, file)}: ${n} messages, more than 100`)
  }
  for (const file of csvFiles(LAYERS.syntactic).filter(file => !file.startsWith(GENERAL + '/'))) {
    const source = join(LAYERS.semantic, relative(LAYERS.syntactic, file))
    if (!existsSync(source)) { problems.push(relative(root, file) + ': no semantic file with this path'); continue }
    const here = rawRows(readFileSync(file, 'utf8')).slice(1).map(firstCell), there = rawRows(readFileSync(source, 'utf8')).slice(1).map(firstCell)
    if (here.length !== there.length) problems.push(`${relative(root, file)}: ${here.length} messages, its semantic file has ${there.length}`)
    else { const at = here.findIndex((message, k) => message !== there[k]); if (at >= 0) problems.push(`${relative(root, file)}: message ${at + 1} differs from its semantic file`) }
  }
  const done = csvFiles(LAYERS.syntactic).length - general.length, all = csvFiles(LAYERS.semantic).length
  for (const problem of problems) console.log(problem)
  console.log(`${done} of ${all} semantic files have their syntactic file. ${problems.length ? problems.length + ' problems.' : 'Every one mirrors its source: same path, same messages, same order.'}` +
    ` syntactic/general/: ${general.length} files of the syntactic layer only. ${seen.size} distinct messages in syntactic/.`)
  if (problems.length) process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [command, ...rest] = process.argv.slice(2)
  const max = rest.includes('--max') ? Number(rest[rest.indexOf('--max') + 1]) : 100
  if (command === 'split' && max >= 1) split(max, rest.includes('--dry'))
  else if (command === 'check') check()
  else { console.error('Usage: node tools/layers.mjs split [--max 100] [--dry] | check'); process.exit(2) }
}
