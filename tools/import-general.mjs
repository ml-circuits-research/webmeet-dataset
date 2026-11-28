// Adds messages to the syntactic layer only: syntactic/general/<name>/NNNN.csv, at most 100 messages per file, with
// the columns of syntactic/ (text, sop, source, accepted_by) and sop empty until a formalizer and a judge fill it.
//   node tools/import-general.mjs <name> <messages.txt> [--source <tag>] [--dry]
// <messages.txt> holds one message per line. A message is left out when it is empty, longer than 600 characters, or
// already in syntactic/ (exactly, or up to case and spaces): every text of the dataset stays unique, so tools find a
// message by its text. New files continue the numbering of syntactic/general/<name>/. The source of each row is
// <tag> (default: <name>); write where the messages come from, and their licence, in syntactic/general/<name>/SOURCE.md.
import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {rawRows, firstCell} from './layers.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2), flag = name => args.includes(name), value = name => args.includes(name) ? args[args.indexOf(name) + 1] : null
const [name, input] = args.filter((arg, k) => !arg.startsWith('--') && !['--source'].includes(args[k - 1]))
if (!name || !input || !/^[a-z0-9][a-z0-9-]*$/u.test(name)) {
  console.error('Usage: node tools/import-general.mjs <name: a-z0-9-> <messages.txt> [--source <tag>] [--dry]'); process.exit(2)
}
const tag = value('--source') ?? name
const key = text => text.trim().replace(/\s+/gu, ' ').toLowerCase()
const walk = dir => readdirSync(dir).flatMap(entry => { const path = join(dir, entry); return statSync(path).isDirectory() ? walk(path) : path.endsWith('.csv') ? [path] : [] })

const known = new Set()
for (const file of walk(join(root, 'syntactic'))) for (const row of rawRows(readFileSync(file, 'utf8')).slice(1)) known.add(key(firstCell(row)))

const counts = {lines: 0, empty: 0, long: 0, known: 0, added: 0}
const fresh = []
for (const line of readFileSync(input, 'utf8').split(/\r?\n/u)) {
  counts.lines++
  const text = line.trim()
  if (!text) { counts.empty++; continue }
  if (text.length > 600) { counts.long++; continue }
  if (known.has(key(text))) { counts.known++; continue }
  known.add(key(text)); fresh.push(text); counts.added++
}

const quote = cell => /[",\n\r]/u.test(cell) ? '"' + cell.replaceAll('"', '""') + '"' : cell
const dir = join(root, 'syntactic', 'general', name)
const taken = existsSync(dir) ? readdirSync(dir).filter(file => /^\d{4}\.csv$/u.test(file)).map(file => Number(file.slice(0, 4))) : []
let next = taken.length ? Math.max(...taken) + 1 : 1, files = 0
if (!flag('--dry')) mkdirSync(dir, {recursive: true})
for (let i = 0; i < fresh.length; i += 100) {
  const body = fresh.slice(i, i + 100).map(text => [quote(text), '', quote(tag), ''].join(',')).join('\n')
  if (!flag('--dry')) writeFileSync(join(dir, String(next).padStart(4, '0') + '.csv'), 'text,sop,source,accepted_by\n' + body + '\n')
  next++; files++
}
console.log(`${counts.lines} lines: ${counts.added} added in ${files} files of syntactic/general/${name}/, ${counts.known} already in syntactic/, ${counts.empty} empty, ${counts.long} longer than 600 characters.` + (flag('--dry') ? ' (dry run: nothing written)' : ''))
