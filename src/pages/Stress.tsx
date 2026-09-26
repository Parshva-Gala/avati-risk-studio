import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, Check, FlaskConical, Info, Save, SlidersHorizontal } from 'lucide-react';
import type { ModuleProps } from '../types';
import { calculateStress, DEFAULT_STRESS_CONFIG, STRESS_PRESETS } from '../lib/risk.mjs';
import { Metric, PageHeader } from '../components/UI';

type Config = typeof DEFAULT_STRESS_CONFIG;
type Preset = keyof typeof STRESS_PRESETS;
function readConfig(raw:unknown):{config:Config;error:string|null} {
  const fallback={...DEFAULT_STRESS_CONFIG};
  if(raw===undefined) return {config:fallback,error:null};
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) return {config:fallback,error:'Saved stress settings are not a valid record.'};
  const config={...fallback,...raw};
  if((Object.keys(fallback) as (keyof Config)[]).some(key=>typeof config[key]!=='number'||!Number.isFinite(config[key]))) return {config:fallback,error:'Saved stress settings contain a missing or invalid number.'};
  return {config,error:null};
}
const presetName=(value:unknown)=>typeof value==='string'&&['baseline','adverse','severe','custom'].includes(value)?value:'adverse';
const money = (value:number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}m`;
const pct = (value:number) => `${(value * 100).toFixed(2)}%`;
const controls:{ key:keyof Config; title:string; min:number; max:number; step:number; format:(n:number)=>string; note:string }[] = [
  { key:'pdMultiplier', title:'Default probability', min:0.5, max:4, step:0.05, format:n=>`${n.toFixed(2)}×`, note:'Multiplies each facility’s annual PD' },
  { key:'lgdAdditive', title:'Loss severity increase', min:0, max:0.4, step:0.01, format:n=>`+${(n*100).toFixed(0)}pp`, note:'Adds percentage points to LGD' },
  { key:'marketDecline', title:'Market price decline', min:0, max:0.5, step:0.01, format:n=>pct(n), note:'Applied to the market portfolio' },
  { key:'incomeShock', title:'Income pressure', min:0, max:0.8, step:0.01, format:n=>pct(n), note:'Reduction in annual pre-tax income' },
  { key:'operationalLoss', title:'Operational loss', min:0, max:40, step:1, format:money, note:'Direct pre-tax loss assumption' },
  { key:'rwaUplift', title:'RWA increase', min:0, max:0.5, step:0.01, format:n=>pct(n), note:'Uplift to the starting RWA base' },
];

export default function Stress({ facilities, settings, saveSetting, onRun }:ModuleProps) {
  const stored=useMemo(()=>readConfig(settings.stressConfig),[settings.stressConfig]);
  const [config, setConfig] = useState<Config>(stored.config);
  const [loadError,setLoadError]=useState(stored.error);
  const [preset, setPreset] = useState<string>(()=>presetName(settings.stressPreset));
  const [saved, setSaved] = useState(false);
  useEffect(()=>{setConfig(stored.config);setLoadError(stored.error);setPreset(presetName(settings.stressPreset));setSaved(false);},[stored,settings.stressPreset]);
  useEffect(()=>{setSaved(false);},[facilities]);
  const calculation = useMemo(()=> {
    try { return { result:calculateStress(facilities, config), error:null }; }
    catch(error) { return { result:null, error:error instanceof Error ? error.message : 'Check the portfolio and assumptions.' }; }
  }, [facilities, config]);
  const result = calculation.result;
  function update(next:Config, label='custom') {
    setConfig(next); setPreset(label); setSaved(false);
    try { calculateStress(facilities,next); } catch { return; }
    saveSetting('stressConfig', next); saveSetting('stressPreset', label);
  }
  function reset(){setLoadError(null);update({...DEFAULT_STRESS_CONFIG},'adverse');}
  function saveRun() {
    if (!result||loadError) return;
    onRun({ module:'Stress', name:`${preset.charAt(0).toUpperCase()+preset.slice(1)} stress assessment`, summary:{ 'After-tax loss (USDm)':result.afterTaxLoss, 'Capital ratio (%)':Number((result.carAfter*100).toFixed(2)), 'Headroom (pp)':Number((result.headroom*100).toFixed(2)) }, payload:result });
    setSaved(true);
  }
  if(loadError) return <><PageHeader eyebrow="RISK LAB / SCENARIO ANALYSIS" title="Stress testing" description="Review the saved assumptions before continuing."/><section className="panel"><h2>Stress settings need attention</h2><p className="notice bad" role="alert">{loadError}</p><p className="muted">Your portfolio and saved reports remain intact. Reset the stress assumptions to the illustrative adverse scenario to continue.</p><button className="btn primary" onClick={reset}>Reset stress assumptions</button></section></>;
  return <>
    <PageHeader eyebrow="RISK LAB / SCENARIO ANALYSIS" title="Stress testing" description="Turn a changing world into a clear view of capital resilience." action={<button className="btn primary" onClick={saveRun} disabled={!result}>{saved?<Check size={16}/>:<Save size={16}/>} {saved?'Snapshot saved':'Save assessment'}</button>}/>
    <div className="panel" style={{ marginBottom:20 }}><div className="panel-header"><div><div className="eyebrow">SCENARIO WORKSPACE</div><h2>How much can your portfolio absorb?</h2></div><span className="badge">Illustrative model</span></div><div className="tabs" aria-label="Stress severity">{(['baseline','adverse','severe'] as Preset[]).map(key=><button key={key} className={preset===key?'active':''} aria-pressed={preset===key} onClick={()=>update({ ...config, ...STRESS_PRESETS[key] },key)}>{key.charAt(0).toUpperCase()+key.slice(1)}</button>)}{preset==='custom'&&<span className="badge warn">Custom shocks</span>}</div><p className="muted" style={{ margin:'12px 0 0' }}>One portfolio. Three starting points. Adjust any driver to build your own scenario.</p></div>
    {calculation.error&&<div className="notice bad" role="alert"><span>{calculation.error} Incomplete edits are not saved.</span><button className="btn small" onClick={reset}>Reset assumptions</button></div>}
    {result&&<div className="metrics"><Metric label="Stressed capital ratio" value={pct(result.carAfter)} detail={<span className={result.headroom>=0?'badge good':'badge bad'}>{result.headroom>=0?'Above':'Below'} planning hurdle</span>}/><Metric label="After-tax loss" value={money(result.afterTaxLoss)} detail={result.capitalBefore?`${pct(result.afterTaxLoss/result.capitalBefore)} of starting capital`:'Starting capital is zero'}/><Metric label="Capital headroom" value={<>{(result.headroom*100).toFixed(2)}<small> pp</small></>} detail={`Against ${pct(config.hurdle)} planning hurdle`}/><Metric label="Stressed RWA" value={money(result.rwaAfter)} detail={`From ${money(result.rwaBefore)} at baseline`}/></div>}
    <div className="grid-2">
      <section className="panel"><div className="panel-header"><div><div className="eyebrow">01 / SHOCK DESIGN</div><h2>Move the drivers</h2></div><SlidersHorizontal size={19}/></div><div style={{ display:'grid', gap:23 }}>{controls.map(control=><label className="field" key={control.key}><span style={{ display:'flex', justifyContent:'space-between', gap:12 }}><span>{control.title}</span><strong>{control.format(config[control.key])}</strong></span><input aria-label={control.title} type="range" min={control.min} max={control.max} step={control.step} value={config[control.key]} onChange={event=>update({ ...config, [control.key]:Number(event.target.value) })}/><small className="muted">{control.note}</small></label>)}</div></section>
      <section className="panel"><div className="panel-header"><div><div className="eyebrow">02 / CAPITAL IMPACT</div><h2>Every movement, explained</h2></div><ArrowDownRight size={21}/></div>{result&&<><div aria-label="Capital loss bridge" style={{ display:'grid', gap:17 }}>{result.bridge.map(item=><div key={item.label}><div style={{ display:'flex', justifyContent:'space-between', gap:16, marginBottom:7 }}><span>{item.label}</span><strong>{item.value<0?'−':''}{money(Math.abs(item.value))}</strong></div><div className="bar-track"><div className="bar-fill" style={{ width:`${Math.max(0.4,Math.min(100, Math.abs(item.value)/Math.max(1,result.capitalBefore)*100))}%`, ...(item.kind==='loss'?{ background:'var(--danger, #bb554f)' }:item.kind==='benefit'?{ background:'var(--success, #19836a)' }:{}) }}/></div></div>)}</div><div className="notice" style={{ marginTop:24 }}><strong>{pct(result.carBefore)} <ArrowRight size={14} style={{ verticalAlign:'middle' }}/> {pct(result.carAfter)}</strong><p style={{ margin:'6px 0 0' }}>Capital falls by {money(result.afterTaxLoss)} after tax; RWA {config.rwaUplift?'increases':'stays unchanged'} at {money(result.rwaAfter)}.</p></div></>}</section>
    </div>
    <section className="panel" style={{ marginTop:20 }}><div className="panel-header"><div><div className="eyebrow">03 / PLANNING ASSUMPTIONS</div><h2>A transparent starting point</h2></div><FlaskConical size={20}/></div><div className="form-grid">{([{key:'capital',label:'Initial capital · USDm',step:1,max:100000},{key:'rwa',label:'Initial RWA · USDm',step:1,max:1000000},{key:'annualIncome',label:'Pre-tax income · USDm',step:1,max:100000},{key:'marketPortfolio',label:'Market portfolio · USDm',step:1,max:100000},{key:'taxRate',label:'Tax rate · %',step:1,max:100},{key:'hurdle',label:'Planning hurdle · %',step:0.1,max:100}] as const).map(field=><label className="field" key={field.key}>{field.label}<input type="number" min={field.key==='rwa'?0.01:0} max={field.max} step={field.step} value={Number.isFinite(config[field.key])?Number((config[field.key]*(field.key==='taxRate'||field.key==='hurdle'?100:1)).toFixed(4)):''} onChange={event=>update({ ...config, [field.key]:event.target.value===''?NaN:Number(event.target.value)/(field.key==='taxRate'||field.key==='hurdle'?100:1) })}/></label>)}</div></section>
    <details className="panel" style={{ marginTop:20 }}><summary style={{ cursor:'pointer', display:'flex', gap:9, alignItems:'center' }}><Info size={17}/><strong>Calculation method & scope</strong></summary><div className="muted" style={{ lineHeight:1.7, marginTop:16 }}><p>Incremental credit loss is stressed lifetime ECL less baseline ECL, floored at zero. Market, income and operational losses are added separately. Tax relief is capped by the entered annual pre-tax income; closing capital is opening capital less the net loss. RWA follows the explicit uplift above.</p><p>PD and LGD are capped at 100%. Existing stages are held constant. This is a simplified planning model with synthetic presets; it does not reproduce a regulator-approved stress model. Capital assumptions are editable and separate from the credit facility dataset. Changing the bank theme never changes these inputs.</p></div></details>
  </>;
}
