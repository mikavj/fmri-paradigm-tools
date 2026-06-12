// Headless cross-check of the viewer's timing engine against real paradigm files.
// Lightweight regex XML walk (mirrors ParadigmViewer.html logic) — no deps.
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';

// Pass a folder (a single paradigm, or a parent holding several); defaults to the current directory.
const ROOT = process.argv[2] || '.';

function walk(dir, out=[]) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.xml$/i.test(f)) out.push(p);
  }
  return out;
}
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? m[1] : null; };
const tagAll = (xml, t) => [...xml.matchAll(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`,'g'))].map(m=>m[1]);
const num = (s, vars) => { if(s==null) return null; s=String(s).trim().replace(/\$(\w+)/g,(m,n)=>n in vars?vars[n]:m); const n=Number(s); return isNaN(n)?null:n; };

function loadVars(xml){ const v={}; const blk=tag(xml,'Variables'); if(blk){ for(const m of blk.matchAll(/<(\w+)>\s*([^<]*?)\s*<\/\1>/g)){ const n=Number(m[2]); v[m[1]]=isNaN(n)?m[2]:n; } } return v; }

function trialDur(trialXml, vars, slides){
  let ms=0, indef=false;
  for(const sh of tagAll(trialXml,'show')){
    let d = num(tag(sh,'duration'), vars);
    if(d==null){ const item=tag(sh,'item')?.trim(); const sl=slides[item]; d = sl&&sl.duration!=null? sl.duration:null; }
    if(d==null) indef=true; else ms+=d;
  }
  for(const w of tagAll(trialXml,'wait')) ms += num(w, vars)||0;
  return {ms, indef};
}

function analyze(mainPath){
  const xml = readFileSync(mainPath,'latin1');
  if(!/<ParameterDescriptionFile/.test(xml) || !/<Session/.test(xml)) return null;
  const dir = dirname(mainPath);
  const vars = loadVars(xml);
  const tr = num(tag(xml,'TimeToRepeat'), vars);
  const declared = num(tag(xml,'Volumes'), vars);
  const name = tag(xml,'Name')?.trim() || basename(mainPath);

  // slides (collect durations from any included slides files, for show-without-duration)
  const slides = {};
  for(const inc of [...xml.matchAll(/<Include[^>]*>([^<]+)<\/Include>/g)].map(m=>m[1].trim())){
    const p = join(dir, inc.replace(/\\/g,'/').replace(/^\.\//,''));
    let s; try{ s=readFileSync(p,'latin1'); }catch{ continue; }
    if(!/<IncludeSlides/.test(s)) continue;
    for(const sl of tagAll(s,'Slide')){ const nm=tag(sl,'name')?.trim(); const d=num(tag(sl,'duration'),vars); slides[nm]={duration:d}; }
  }
  // trials
  const trials = {};
  for(const inc of [...xml.matchAll(/<Include[^>]*>([^<]+)<\/Include>/g)].map(m=>m[1].trim())){
    const p = join(dir, inc.replace(/\\/g,'/').replace(/^\.\//,''));
    let s; try{ s=readFileSync(p,'latin1'); }catch{ continue; }
    if(!/<IncludeTrials/.test(s)) continue;
    for(const t of tagAll(s,'Trial')){ const nm=tag(t,'name')?.trim(); trials[nm]={xml:t, reg:/<register/.test(t), cond: tag(t,'condition')!=null?Number(tag(t,'condition').trim()):null}; }
  }
  // blocks
  const blocks = {};
  for(const b of tagAll(xml,'Block')){ const nm=tag(b,'name')?.trim(); blocks[nm]={ trials:tagAll(b,'trials').map(x=>x.trim()), reps:num(tag(b,'repetitions'),vars)??1, cond: tag(b,'condition')!=null?Number(tag(b,'condition').trim()):1 }; }
  // session
  const sess = tag(xml,'Session');
  const items = [...sess.matchAll(/<(runtrial|runblock)>([^<]+)<\/\1>/g)].map(m=>({type:m[1],name:m[2].trim()}));

  let total=0, active=0, rest=0;
  for(const it of items){
    if(it.type==='runtrial'){
      const t=trials[it.name]; if(!t){ continue; }
      if(t.reg) continue; // trigger, 0 scan time
      const d=trialDur(t.xml,vars,slides); if(d.indef) continue;
      total+=d.ms; if((t.cond??0)>0) active+=d.ms; else rest+=d.ms;
    } else {
      const b=blocks[it.name]; if(!b) continue;
      let one=0; for(const tn of b.trials){ const t=trials[tn]; if(t) one+=trialDur(t.xml,vars,slides).ms; }
      const d=one*b.reps; total+=d; if(b.cond>0) active+=d; else rest+=d;
    }
  }
  const cv = tr? total/tr : null;
  return { name, tr, declared, total, cv, active, rest, match: (declared!=null&&cv!=null)? Math.abs(cv-declared)<0.5 : null };
}

const mains = walk(ROOT);
const rows = [];
for(const m of mains){ const r=analyze(m); if(r) rows.push(r); }
rows.sort((a,b)=>a.name.localeCompare(b.name));
console.log('PARADIGM'.padEnd(30), 'TR'.padStart(5), 'dur(s)'.padStart(8), 'computed'.padStart(9), 'declared'.padStart(9), '  status');
for(const r of rows){
  const st = r.match===null?'(no decl)': r.match?'✅ match':`⛔ MISMATCH Δ${(r.cv-r.declared).toFixed(0)}vol`;
  console.log(r.name.padEnd(30), String(r.tr).padStart(5), (r.total/1000).toFixed(0).padStart(8), (r.cv?.toFixed(1)??'—').padStart(9), String(r.declared??'—').padStart(9), '  '+st);
}
