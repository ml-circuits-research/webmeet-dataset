// Run a local soplang-nlu strategy on the exact texts in one JSONL batch.
import {readFileSync,writeFileSync,linkSync,unlinkSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
import {performance} from 'node:perf_hooks'

const [strategyName,input,output]=process.argv.slice(2)
const choices=new Map([['prolog','prolog'],['z3','z3'],['spacy-direct','spacyDirect'],['spacy-beam','spacyBeam'],
  ['neuro-prolog','neuroProlog'],['neuro-z3','neuroZ3'],['neuro-selector','neuroSelector'],
  ['distilbert','distilBert'],['selector-distilbert','selectorDistilBert']])
if(!output||!choices.has(strategyName)||!process.env.SOP_NLU_DIR||!process.env.SOP_KNOWLEDGE_DIR)
  throw Error('Set SOP_NLU_DIR and SOP_KNOWLEDGE_DIR, then supply STRATEGY INPUT.jsonl[.gz] NEW_OUTPUT.jsonl[.gz]')
if(existsSync(output))throw Error('Output already exists')
const load=path=>import(pathToFileURL(join(resolve(process.env.SOP_NLU_DIR),path)))
const {createReader}=await load('lib/reader.mjs')
const {hasCompleteSource}=await load('lib/check-analysis.mjs')
const strategy=(await load('strategies/'+strategyName+'/index.mjs'))[choices.get(strategyName)]
const bytes=readFileSync(input)
const rows=(input.endsWith('.gz')?gunzipSync(bytes):bytes).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
if(!rows.length||rows.some(r=>typeof r.text!=='string'||!r.text.trim()||typeof r.id!=='string'||!r.id)||
    new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Expected distinct IDs and nonempty source texts')
const started=performance.now()
const reader=await createReader({strategy,knowledgeDir:resolve(process.env.SOP_KNOWLEDGE_DIR),maxReadings:2})
const startupMs=performance.now()-started
const records=[]
try{
  for(const {id,text} of rows){
    const request=performance.now()
    const result=await reader.propose(text)
    records.push({id,text,strategy:strategyName,requestMs:performance.now()-request,error:result.error??null,
      candidates:result.candidates.map(({sop,check})=>({sop,sourceComplete:hasCompleteSource(check)})),
      rejected:result.rejected?.length??0})
  }
}finally{await reader.close()}
const data=records.map(r=>JSON.stringify(r)).join('\n')+'\n'
const tmp=output+'.'+randomUUID()+'.tmp'
writeFileSync(tmp,output.endsWith('.gz')?gzipSync(data):data,{flag:'wx'})
try{linkSync(tmp,output)}finally{unlinkSync(tmp)}
const errors=records.filter(r=>r.error).length
console.log(JSON.stringify({rows:rows.length,strategy:strategyName,startupMs,wallMs:performance.now()-started,
  withCompleteReading:records.filter(r=>r.candidates.some(c=>c.sourceComplete)).length,errors}))
if(errors)process.exitCode=1
