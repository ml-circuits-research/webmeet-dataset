// Measure migration coverage in a committed WebMeet revision.
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {readRecords} from './rows.mjs'

const root=fileURLToPath(new URL('..',import.meta.url))
const git=(repo,...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:128*1024*1024})
const hash=value=>createHash('sha256').update(value).digest('hex')
const [ref='HEAD']=process.argv.slice(2)
const {SOP_NLU_DIR:nlu,SOP_KNOWLEDGE_DIR:knowledge}=process.env
if(!nlu||!knowledge)throw Error('Set SOP_NLU_DIR and SOP_KNOWLEDGE_DIR')
const revision=git(root,'rev-parse','--verify',ref+'^{commit}').trim()
const nluDir=resolve(nlu),knowledgeDir=resolve(knowledge)
const {createAnalysisValidator,hasCompleteSource}=await import(pathToFileURL(join(nluDir,'lib/check-analysis.mjs')))
const validate=await createAnalysisValidator({knowledgeDir})
const paths=git(root,'ls-tree','-r','--name-only',revision).trim().split('\n')
const registry=paths.filter(path=>/^annotations\/nlu\/v1\/(?:readings|batches\/[^/]+)\.jsonl$/u.test(path))
const native=new Map(), findingCounts={}
let circuits=0, currentCircuits=0
for(const path of registry){
  for(const line of git(root,'show',revision+':'+path).split('\n').filter(Boolean)){
    const {text,readings}=JSON.parse(line)
    if(typeof text!=='string'||native.has(text)||!Array.isArray(readings)||!readings.length)
      throw Error('Invalid or repeated exact source in '+path)
    let passing=0, byIdentity=0
    for(const {sop,review} of readings){
      const check=validate(text,sop)
      passing+=Number(hasCompleteSource(check))
      byIdentity+=Number(review?.identity===hash(JSON.stringify([text,sop]))&&
        /^[a-f0-9]{64}$/u.test(review?.auditSha256??''))
      for(const finding of check.findings??[]){
        const key=finding.code??finding.kind??'other'
        findingCounts[key]=(findingCounts[key]??0)+1
      }
    }
    circuits+=readings.length
    currentCircuits+=passing
    native.set(text,{passing,total:readings.length,hasDirectAuditDigest:byIdentity===readings.length})
  }
}
const matched=new Set()
const files=[]
const rowCounts=()=>({rows:0,legacyOnly:0,nativeCurrent:0,nativeNeedsRecheck:0,withoutDirectAuditDigest:0})
const totals=rowCounts()
for(const path of paths.filter(path=>path.endsWith('.csv'))){
  const input=readRecords(git(root,'show',revision+':'+path))
  if(!input.ok)throw Error(path+': '+input.why)
  const counts=rowCounts()
  for(const {text} of input.records){
    counts.rows++
    const record=native.get(text)
    if(!record){counts.legacyOnly++;continue}
    matched.add(text)
    if(record.passing===record.total)counts.nativeCurrent++
    else counts.nativeNeedsRecheck++
    if(!record.hasDirectAuditDigest)counts.withoutDirectAuditDigest++
  }
  for(const field of Object.keys(counts))totals[field]+=counts[field]
  const status=counts.legacyOnly===counts.rows?'legacy-only':
    counts.nativeCurrent===counts.rows?'native-complete':'partial'
  files.push({path,status,...counts})
}
console.log(JSON.stringify({revision,
  libraryRevision:git(nluDir,'rev-parse','HEAD').trim(),knowledgeRevision:git(knowledgeDir,'rev-parse','HEAD').trim(),
  validatorSha256:hash(readFileSync(join(nluDir,'lib/check-analysis.mjs'))),
  nativeSchemaSha256:hash(readFileSync(join(nluDir,'schemas/nlu/schema.sop'))),
  totals,registry:{shards:registry.length,exactTexts:native.size,unmatchedExactTexts:native.size-matched.size,circuits,currentCircuits},
  findingCounts,files},null,2))
