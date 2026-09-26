import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { Upload, Download, Search, SlidersHorizontal, CheckCircle2, FileSpreadsheet, X, Database } from 'lucide-react';
import type { Bank, Facility } from '../types';
import { validatePortfolio, COLUMNS, demoPortfolio } from '../lib/portfolio.mjs';
import { deriveStages } from '../lib/risk.mjs';
import { money, pct, downloadCSV } from '../lib/format';
import { downloadWorkbook } from '../lib/workbook-download';
import { PageHeader, Panel, Metric } from '../components/UI';
export default function Portfolio({facilities,onReplace,version,bank='midbank'}:{facilities:Facility[],onReplace:(f:Facility[],detail:string)=>void,version:number,bank?:Bank}){
 const [query,setQuery]=useState(''),[sector,setSector]=useState('All sectors'),[stage,setStage]=useState('All stages'),[preview,setPreview]=useState<Facility[]|null>(null),[errors,setErrors]=useState<string[]>([]),[fileName,setFileName]=useState(''),[selected,setSelected]=useState<Facility|null>(null);const file=useRef<HTMLInputElement>(null);
 const [importing,setImporting]=useState(false),[exporting,setExporting]=useState(false),[downloadError,setDownloadError]=useState('');
 const stages=useMemo(()=>new Map(deriveStages(facilities).map(f=>[f.id,f.stage])),[facilities]); const stageOf=(f:Facility)=>stages.get(f.id)||1;
 const rows=useMemo(()=>facilities.filter(f=>(`${f.borrower} ${f.id} ${f.country}`.toLowerCase().includes(query.toLowerCase()))&&(sector==='All sectors'||f.sector===sector)&&(stage==='All stages'||stageOf(f)===Number(stage))),[facilities,query,sector,stage,stages]);
 const total=facilities.reduce((n,f)=>n+f.balance,0); const watch=facilities.filter(f=>stageOf(f)>1).length;
 async function importFile(f:File){
  setFileName(f.name);setErrors([]);setPreview(null);setImporting(true);
  try{
   const extension=f.name.toLowerCase().split('.').pop();
   if(extension!=='csv'&&extension!=='xlsx'){setErrors(['Choose a .csv or .xlsx file. For other Excel formats, save a values-only Excel Workbook (.xlsx) first.']);return;}
   const xlsx=extension==='xlsx';
   if(f.size>(xlsx?15_000_000:8_000_000)){setErrors([xlsx?'Please use an XLSX under 15 MB.':'Please use a CSV under 8 MB.']);return;}
   let records:Record<string,unknown>[];
   if(xlsx){
    const {readPortfolioWorkbook}=await import('../lib/workbooks.mjs');
    const parsed=await readPortfolioWorkbook(await f.arrayBuffer());
    if(parsed.errors.length){setErrors(parsed.errors);return;}
    records=parsed.rows as Record<string,unknown>[];
   }else{
    const parsed=Papa.parse<Record<string,unknown>>(await f.text(),{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim().replace(/^\uFEFF/,'')});
    if(parsed.errors.length){setErrors(parsed.errors.map(e=>e.message));return;}
    records=parsed.data;
   }
   const checked=validatePortfolio(records);setErrors(checked.errors);if(!checked.errors.length)setPreview(checked.rows as Facility[]);
  }catch(error){setErrors([error instanceof Error?`Unable to read this file: ${error.message}`:'Unable to read this file. Please choose it again.']);}
  finally{setImporting(false);}
 }
 async function exportWorkbook(exportRows:Facility[],filename:string){
  setDownloadError('');setExporting(true);
  try{await downloadWorkbook([{name:'Portfolio',rows:exportRows.map(f=>({...f}))}],bank,filename);}
  catch(error){setDownloadError(error instanceof Error?`Excel export failed: ${error.message}`:'Excel export failed. Please try again.');}
  finally{setExporting(false);}
 }
 return <><PageHeader eyebrow="01 / Connected data" title="Your portfolio, in focus." description="One validated facility master connects every model and report." action={<><button className="btn" onClick={()=>downloadCSV('avati-portfolio-template.csv',demoPortfolio().slice(0,2))}><Download size={16}/>CSV template</button><button className="btn" disabled={exporting} onClick={()=>void exportWorkbook(demoPortfolio().slice(0,2) as Facility[],'avati-portfolio-template.xlsx')}><FileSpreadsheet size={16}/>XLSX template</button><button className="btn primary" disabled={importing} onClick={()=>file.current?.click()}><Upload size={16}/>{importing?'Validating…':'Import portfolio'}</button></>}/><input ref={file} type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Import portfolio CSV or XLSX" disabled={importing} onChange={e=>{if(e.target.files?.[0])void importFile(e.target.files[0]);e.target.value='';}}/>
 {downloadError&&<div className="notice" role="alert">{downloadError}<button className="icon-button" aria-label="Dismiss export error" onClick={()=>setDownloadError('')}><X size={16}/></button></div>}
 <div className="metrics"><Metric label="Drawn exposure" value={`$${money(total)}m`} detail="Normalized to USD millions" icon={<Database size={16}/>}/><Metric label="Facilities" value={facilities.length} detail={`${new Set(facilities.map(f=>f.borrower)).size} connected borrowers`}/><Metric label="Watch & default" value={watch} detail="Including borrower contagion"/><Metric label="Portfolio version" value={`v${version}`} detail="Saved reports retain their input snapshot"/></div>
 {(errors.length>0||preview)&&<section className="panel import-preview"><div className="panel-header"><h2>{errors.length?'Import needs attention':'Ready to import'}</h2><button className="icon-button" aria-label="Close import preview" onClick={()=>{setErrors([]);setPreview(null);}}><X size={18}/></button></div><p>{fileName}</p>{errors.length?<ul className="error-list">{errors.slice(0,12).map((e,i)=><li key={i}>{e}</li>)}{errors.length>12&&<li>{errors.length-12} more validation issues</li>}</ul>:<><div className="notice"><CheckCircle2 size={18}/>{preview!.length} valid facilities · ${money(preview!.reduce((s,f)=>s+f.balance,0))}m drawn exposure. Applying this import replaces the current master and advances its version.</div><div className="button-row"><button className="btn primary" onClick={()=>{onReplace(preview!,`Imported ${preview!.length} facilities from ${fileName}`);setPreview(null);}}>Apply validated import</button><button className="btn" onClick={()=>setPreview(null)}>Cancel</button></div></>}</section>}
 <Panel title="Facility explorer" subtitle="Select a borrower to inspect the inputs shared across modules." action={<div className="button-row"><button className="btn small" onClick={()=>downloadCSV('avati-portfolio.csv',rows as unknown as Record<string,unknown>[])}><Download size={14}/>Export filtered CSV</button><button className="btn small" disabled={exporting||!rows.length} onClick={()=>void exportWorkbook(rows,'avati-portfolio.xlsx')}><FileSpreadsheet size={14}/>{exporting?'Preparing XLSX…':'Export filtered XLSX'}</button></div>}>
 <div className="filter-bar"><label className="search-field"><Search size={17}/><input aria-label="Search portfolio" placeholder="Search borrower, ID or country…" value={query} onChange={e=>setQuery(e.target.value)}/></label><SlidersHorizontal size={16}/><select aria-label="Sector filter" value={sector} onChange={e=>setSector(e.target.value)}><option>All sectors</option>{[...new Set(facilities.map(f=>f.sector))].sort().map(s=><option key={s}>{s}</option>)}</select><select aria-label="Stage filter" value={stage} onChange={e=>setStage(e.target.value)}><option>All stages</option><option value="1">Stage 1</option><option value="2">Stage 2</option><option value="3">Stage 3</option></select><span className="muted">{rows.length} facilities</span></div>
 <div className="table-wrap"><table className="data-table"><thead><tr><th>Borrower / Facility</th><th>Sector</th><th>Country</th><th className="numeric">Drawn / $m</th><th className="numeric">PD</th><th>Credit stage</th><th>ESG score</th><th/></tr></thead><tbody>{rows.slice(0,200).map(f=><tr key={f.id}><td><button className="table-link" onClick={()=>setSelected(f)}>{f.borrower}</button><small>{f.id}</small></td><td>{f.sector}</td><td>{f.country}</td><td className="numeric">{money(f.balance)}</td><td className="numeric">{pct(f.pd)}</td><td><span className={`badge ${stageOf(f)===1?'good':stageOf(f)===2?'warn':'bad'}`}>Stage {stageOf(f)}</span></td><td><span className="score-inline"><i style={{width:`${f.esgScore*.45}px`}}/>{f.esgScore}</span></td><td><button className="icon-button" aria-label={`Inspect ${f.borrower}`} onClick={()=>setSelected(f)}>↗</button></td></tr>)}</tbody></table>{!rows.length&&<div className="empty">No facilities match these filters.</div>}</div><div className="table-footer">{rows.length>200?'Showing the first 200 matched facilities. Export includes every matched record.':'All amounts in USD millions. Rates shown as percentages.'}<span>Borrower-level contagion is applied in the ECL engine.</span></div></Panel>
 <div className="notice muted"><FileSpreadsheet size={18}/><span>CSV and XLSX imports use exact template headers. Excel imports read the Portfolio worksheet, or the first sheet, and require values without formulas or macros. Monetary amounts must already be in USD millions; PD, LGD, CCF and rate use fractions (0.05 = 5%). Missing and invalid values block the import. Files are processed locally in this browser.</span></div>
 {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="modal" role="dialog" aria-modal="true" aria-label="Facility details" onClick={e=>e.stopPropagation()}><div className="panel-header"><div><div className="eyebrow">Connected facility / {selected.id}</div><h2>{selected.borrower}</h2></div><button autoFocus className="icon-button" aria-label="Close facility details" onClick={()=>setSelected(null)}><X/></button></div><div className="detail-grid">{COLUMNS.filter(k=>!['id','borrower'].includes(k)).map(k=><div key={k}><small>{k.replace(/([A-Z])/g,' $1')}</small><strong>{String(selected[k as keyof Facility])}</strong></div>)}</div><p className="muted">Input values shown as stored. Financial amounts are USD millions; emissions are tCO₂e.</p></section></div>}
 </>;
}
