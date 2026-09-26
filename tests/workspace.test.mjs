import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { demoPortfolio } from '../src/lib/portfolio.mjs';
import { calculateECL, calculateStress, DEFAULT_ECL_SCENARIOS, DEFAULT_STRESS_CONFIG } from '../src/lib/risk.mjs';
import { calculateESG, DEFAULT_ESG_CONFIG } from '../src/lib/esg.mjs';
import { validateWorkspaceData } from '../src/lib/workspace.mjs';
import * as portfolioModule from '../src/lib/portfolio.mjs';
import * as workspaceModule from '../src/lib/workspace.mjs';
import { buildRiskCubeProjection } from '../src/lib/riskcube-adapter.mjs';
import { runCube, DEFAULT_CUBE_CONFIG } from '../src/lib/cube.mjs';
import { connectedContext, riskInputs } from '../src/lib/cube-context.mjs';
import { runJKBStress, DEFAULT_JKB_CONFIG } from '../src/lib/jkb-stress.mjs';
import { mapJKBCaseToConfig, validateJKBWorkbookData } from '../src/lib/jkb-workbook.mjs';

const source=fs.readFileSync(new URL('../src/lib/format.ts',import.meta.url),'utf8');
const {csvCell}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const storeSource=fs.readFileSync(new URL('../src/lib/store.ts',import.meta.url),'utf8');
const storeExports={};
new Function('require','exports',ts.transpileModule(storeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(id=>({'./portfolio.mjs':portfolioModule,'./workspace.mjs':workspaceModule})[id],storeExports);
const stamp='2026-09-27T12:00:00.000Z';
const workspace=()=>({schemaVersion:1,bank:'midbank',facilities:demoPortfolio(),portfolioVersion:1,runs:[],events:[{id:'event-1',date:stamp,action:'Created',detail:'Synthetic workspace'}],settings:{}});
const run=(module='Pivot',overrides={})=>{
  const facilities=demoPortfolio();
  const analysis=module==='ECL'?calculateECL(facilities):module==='Stress'?calculateStress(facilities):module==='ESG'?{config:structuredClone(DEFAULT_ESG_CONFIG),result:calculateESG(facilities)}:module==='RiskCube'?runCube(facilities):{dimension:'sector',measure:'balance',groups:[]};
  return {id:'run-1',name:'Synthetic capture',date:stamp,module,bank:'midbank',portfolioVersion:1,summary:{total:42},payload:{modelVersion:'avati-1.0',analysis,portfolio:facilities,settings:{}},...overrides};
};
const connectedWorkspace=()=>{
  const w=workspace();
  const selection={bankId:'DEMO',modelDate:'2026-09-27',mefDate:'2026-09-27',scenarioId:'2',firstYear:2027,pdUnit:'fraction',pdBasis:'annual-conditional'};
  const rows=[...new Set(w.facilities.map(f=>f.sector))].flatMap(sector=>Array.from({length:Math.max(...w.facilities.filter(f=>f.sector===sector).map(f=>f.years))},(_,i)=>({BANK_ID:'DEMO',IFRS_MODEL_UPDATION_DATE:selection.modelDate,MEF_DATE:selection.mefDate,SCENARIO_ID:'2',IFRS_SEGMENT_ID:sector,COUNTRY_ID:'',PERIOD_YEAR:2027+i,PROJECTED_PD:.02+i*.001})));
  w.settings={cubeProjection:{rows,selection},cubeConfig:{...DEFAULT_CUBE_CONFIG}};
  const projection=buildRiskCubeProjection(w.facilities,rows,selection);
  assert.equal(projection.valid,true);
  const analysis=runCube(w.facilities,{...DEFAULT_CUBE_CONFIG,runId:'captured-connected-1',pdOverrides:projection.facilityCurves,pdProvenance:projection.provenance});
  w.runs=[run('RiskCube',{payload:{modelVersion:'avati-1.0',analysis,portfolio:structuredClone(w.facilities),settings:structuredClone(w.settings)}})];
  return JSON.parse(JSON.stringify(w));
};
const nativePack=()=>{
  const inputs=structuredClone(DEFAULT_JKB_CONFIG.inputs),asOf='2026-01-31',entity='SYNTHETIC_BANK',scenarioId='SYN_CR',elementId='SYN_CR_E1',severity='MODERATE';
  const key=JSON.stringify([asOf,entity,scenarioId,elementId,severity]);
  return {source:{filename:'synthetic-jkb.xlsm',version:'JKB reconciliation pack',sheets:[{name:'Scenario Element Output',visibility:'visible'}],headerRow:3,sourceSheet:'Scenario Element Output',macroContentIgnored:true,containsMacros:true,currency:'JOD',amountUnit:'units',amountConversion:'none',recordCount:2,caseCount:1},cases:[{key,scenarioId,elementId,severity,asOf,entity,elementType:'Specified portfolio segment moves from performing to NPA',label:'Synthetic migration',row:5,inputs,shock:{pct:.1,amount:0,numCustomers:1},missingInputs:[],provenance:{},hasBaseline:true}],baselineInputs:{...inputs},baselines:[{asOf,entity,row:4,inputs:{...inputs},provenance:{}}],outputs:[{caseKey:key,values:{TOTAL_RWA:1000,REGULATORY_CAR:.2},status:'imported-system-snapshot'}],warnings:[],errors:[]};
};
const jkbWorkspace=(native=false)=>{
  const w=workspace();let config=structuredClone(DEFAULT_JKB_CONFIG);
  if(native){w.settings.jkbWorkbook=nativePack();config=mapJKBCaseToConfig(w.settings.jkbWorkbook,w.settings.jkbWorkbook.cases[0].key,config);}
  w.settings.jkbStressConfig=config;
  const analysis=runJKBStress(w.facilities,config);
  w.runs=[run('Stress',{summary:Object.fromEntries(Object.entries(analysis.summary).map(([key,value])=>[key,value??'Unavailable'])),payload:{modelVersion:'avati-1.0',analysis,portfolio:structuredClone(w.facilities),settings:structuredClone(w.settings)}})];
  return JSON.parse(JSON.stringify(w));
};

test('accepts valid synthetic workspace and each captured module envelope',()=>{
  for(const module of ['ESG','ECL','Stress','Pivot','RiskCube']){const w=workspace();w.runs=[run(module)];assert.equal(validateWorkspaceData(w).runs[0].module,module);}
});
test('valid saved ESG, ECL and stress settings round trip without mutation',()=>{
  const w=workspace();w.settings={esg:structuredClone(DEFAULT_ESG_CONFIG),eclScenarios:structuredClone(DEFAULT_ECL_SCENARIOS),stressConfig:{...DEFAULT_STRESS_CONFIG},stressPreset:'adverse'};
  const before=JSON.stringify(w);assert.deepEqual(validateWorkspaceData(JSON.parse(before)),w);assert.equal(JSON.stringify(w),before);
});
test('rejects malformed module settings before any view can consume them',()=>{
  for(const settings of [{esg:{asOf:{}}},{esg:{taxonomy:{F1:{activity:{}}}}},{eclScenarios:[null]},{eclScenarios:[{id:'baseline',name:{},weight:1,pdMultiplier:1}]},{eclScenarios:[{id:'baseline',name:'Base',weight:.5,pdMultiplier:1}]},{stressConfig:{pdMultiplier:{}}},{stressConfig:{rwa:0}},{stressPreset:{}}]){const w=workspace();w.settings=settings;assert.throws(()=>validateWorkspaceData(w));}
});
test('rejects invalid or ambiguous run and event metadata',()=>{
  for(const patch of [{date:'2026-02-30T12:00:00.000Z'},{date:'not a date'},{portfolioVersion:0},{portfolioVersion:2},{id:''},{summary:[]},{summary:{total:null}}]){const w=workspace();w.runs=[run('Pivot',patch)];assert.throws(()=>validateWorkspaceData(w));}
  const duplicate=workspace();duplicate.runs=[run(),run()];assert.throws(()=>validateWorkspaceData(duplicate),/unique/);
  const events=workspace();events.events.push({...events.events[0]});assert.throws(()=>validateWorkspaceData(events),/unique/);
  const badDate=workspace();badDate.events[0].date='yesterday';assert.throws(()=>validateWorkspaceData(badDate),/timestamps/);
});
test('run payload requires supported model metadata, portfolio and settings',()=>{
  for(const payload of [null,{}, {modelVersion:'unknown',analysis:{},portfolio:demoPortfolio(),settings:{}},{modelVersion:'avati-1.0',analysis:{},portfolio:[],settings:{}},{modelVersion:'avati-1.0',analysis:{},portfolio:demoPortfolio(),settings:{stressConfig:null}}]){const w=workspace();w.runs=[run('Pivot',{payload})];assert.throws(()=>validateWorkspaceData(w));}
});
test('one portfolio version cannot claim different facility inputs',()=>{
  const w=workspace();w.runs=[run()];w.runs[0].payload.portfolio[0].balance+=1;assert.throws(()=>validateWorkspaceData(w),/inconsistent/);
  w.portfolioVersion=2;assert.doesNotThrow(()=>validateWorkspaceData(w));
  w.runs.push({...run(),id:'run-2'});assert.throws(()=>validateWorkspaceData(w),/inconsistent/);
});
test('normalizes stored portfolio fields in current and captured inputs consistently',()=>{
  const w=workspace();w.runs=[run()];w.facilities[0].balance=String(w.facilities[0].balance);w.runs[0].payload.portfolio[0].balance=String(w.runs[0].payload.portfolio[0].balance);
  const result=validateWorkspaceData(w);assert.equal(typeof result.facilities[0].balance,'number');assert.equal(typeof result.runs[0].payload.portfolio[0].balance,'number');assert.equal(typeof w.facilities[0].balance,'string');
});
test('analysis duplicate metadata cannot contradict saved run envelope',()=>{
  const w=workspace();w.runs=[run()];w.runs[0].payload.analysis.bank='jkb';assert.throws(()=>validateWorkspaceData(w),/bank conflicts/);
  w.runs[0].payload.analysis={portfolioVersion:2};assert.throws(()=>validateWorkspaceData(w),/version conflicts/);
});
test('RiskCube export survives disconnect and portfolio changes while malformed exports are rejected',()=>{
  const w=workspace();w.settings.cubeProjection=null;assert.doesNotThrow(()=>validateWorkspaceData(w));
  const selection={bankId:'DEMO',modelDate:'2026-09-27',mefDate:'2026-09-27',scenarioId:'2',firstYear:2027,pdUnit:'fraction',pdBasis:'annual-conditional'};
  const rows=[{BANK_ID:'DEMO',IFRS_MODEL_UPDATION_DATE:'2026-09-27',MEF_DATE:'2026-09-27',SCENARIO_ID:'2',IFRS_SEGMENT_ID:'Unmapped',PERIOD_YEAR:2027,PROJECTED_PD:.02}];
  w.settings.cubeProjection={rows,selection};assert.doesNotThrow(()=>validateWorkspaceData(w));assert.equal(buildRiskCubeProjection(w.facilities,rows,selection).valid,false);
  w.runs=[run('RiskCube')];assert.doesNotThrow(()=>validateWorkspaceData(w));
  w.settings.cubeProjection.selection.pdUnit='guess';assert.throws(()=>validateWorkspaceData(w),/projection/);
});
test('RiskCube settings reject malformed values and hidden PD overrides',()=>{
  const w=workspace();w.settings.cubeConfig={...DEFAULT_CUBE_CONFIG};assert.doesNotThrow(()=>validateWorkspaceData(w));
  w.settings.cubeConfig.macroPdMultiplier={};assert.throws(()=>validateWorkspaceData(w),/RiskCube settings/);
  w.settings.cubeConfig={...DEFAULT_CUBE_CONFIG,pdOverrides:[]};assert.throws(()=>validateWorkspaceData(w),/cubeProjection/);
});
test('JKB portfolio and native-currency snapshots round trip alongside legacy stress runs',()=>{
  for(const native of [false,true]){const w=jkbWorkspace(native);w.runs.push(run('Stress',{id:'legacy-stress'}));assert.deepEqual(validateWorkspaceData(w),w);}
  const w=jkbWorkspace(true);const analysis=w.runs[0].payload.analysis;
  assert.equal(analysis.units.currency,'JOD');assert.equal(analysis.units.amountUnit,'units');
  assert.equal(analysis.baseline.ead,1000);assert.equal(analysis.baseline.cet1,250);
  assert.equal(validateJKBWorkbookData(w.settings.jkbWorkbook).source.amountConversion,'none');
});
test('malformed native settings and failed imports cannot poison restored workspace state',()=>{
  for(const config of [null,{basis:'portfolio',currency:'JOD'},{basis:'portfolio',amountUnit:'units'},{severity:'ADVERSE'},{inputs:{taxRate:2}},{source:{currency:'EUR'}}]){const w=workspace();w.settings.jkbStressConfig=config;assert.throws(()=>validateWorkspaceData(w),/JKB stress/);}
  for(const patch of [p=>{p.source.currency='LCY';},p=>{p.source.amountConversion='automatic';},p=>{p.source.currency={};},p=>{p.outputs[0].status='verified';},p=>{p.cases[0].inputs.cet1='=1+1';},p=>{p.cases.push({...p.cases[0]});},p=>{p.hiddenCache={customer:'not part of schema'};}]){const w=workspace();w.settings.jkbWorkbook=nativePack();patch(w.settings.jkbWorkbook);assert.throws(()=>validateWorkspaceData(w),/JKB workbook/);}
  const w=workspace();w.settings.jkbWorkbook={source:null,cases:[],errors:['Import failed']};assert.throws(()=>validateWorkspaceData(w),/JKB workbook/);
});
test('JKB snapshot rejects relabeled currencies, wrong source cases and mixed metric units',()=>{
  for(const patch of [a=>{a.units.currency='USD';},a=>{a.units.amountUnit='millions';},a=>{a.basis='portfolio';},a=>{a.case.id='market-fx';},a=>{a.shock.pct=.9;},a=>{a.rows[0].unit='fraction';},a=>{a.rows[0].postShock+=10;},a=>{a.rows[1].id=a.rows[0].id;},a=>{a.summary.capitalAfter+=1;},a=>{a.checks[0].status='FAIL';},a=>{a.config.source.entity='OTHER';}]){const w=jkbWorkspace(true);patch(w.runs[0].payload.analysis);assert.throws(()=>validateWorkspaceData(w),/JKB/);}
  const w=jkbWorkspace(true);w.runs[0].payload.settings.jkbWorkbook.source.currency='EUR';assert.throws(()=>validateWorkspaceData(w),/native provenance/);
});
test('unavailable JKB ratios remain null in complete results and text in report summaries',()=>{
  const w=workspace(),config={...structuredClone(DEFAULT_JKB_CONFIG),inputs:{...DEFAULT_JKB_CONFIG.inputs,outflows:80,inflows:80,rsf:0,liquidLiabilities:0}};
  const analysis=runJKBStress(w.facilities,config);assert.equal(analysis.summary.lcrAfter,null);assert.equal(analysis.summary.nsfrAfter,null);
  w.settings.jkbStressConfig=config;w.runs=[run('Stress',{summary:{lcrAfter:'Unavailable',nsfrAfter:'Unavailable'},payload:{modelVersion:'avati-1.0',analysis,portfolio:w.facilities,settings:w.settings}})];
  assert.doesNotThrow(()=>validateWorkspaceData(JSON.parse(JSON.stringify(w))));
});
test('JKB metric pivots preserve one currency/unit and one row per metric without totals',()=>{
  const w=jkbWorkspace(true),assessment=w.runs[0].payload.analysis;
  const groups=assessment.rows.filter(row=>row.unit==='fraction').map(row=>({...row,key:row.id,category:['car','cet1Ratio'].includes(row.id)?'Capital':'Liquidity',value:row.postShock}));
  const analysis={source:'jkb',dimension:'metric',measure:'postShock',unit:'fraction',category:'',sector:'',tolerance:.000001,groups,jkbAssessment:assessment};
  w.runs=[run('Pivot',{summary:{metrics:groups.length,unit:'fraction'},payload:{modelVersion:'avati-1.0',analysis,portfolio:w.facilities,settings:w.settings}})];
  assert.doesNotThrow(()=>validateWorkspaceData(w));
  w.runs[0].payload.analysis.groups[0].unit='amount';assert.throws(()=>validateWorkspaceData(w),/JKB pivot/);
});
test('a captured connected run round trips with complete source projection and one consistent run ID',()=>{
  const w=connectedWorkspace();const restored=validateWorkspaceData(w);
  assert.equal(restored.runs[0].payload.analysis.contract.rows[0].RUN_ID,'captured-connected-1');
  assert.equal(restored.runs[0].payload.analysis.contract.mode,'validated-export-input');
  assert.deepEqual(restored,w);
});
test('connected snapshots reject mixed run identities, invented provenance and mismatched source curves',()=>{
  const patches=[
    a=>{a.config.runId='new-id-with-old-output';},
    a=>{a.context.scenarioId='another-scenario';},
    a=>{a.contract.context.asOf='2026-09-26';},
    a=>{a.contract.rows[0].RUN_ID='another-run';},
    a=>{a.contract.rows[0].FACILITY_ID=a.contract.rows[1].FACILITY_ID;},
    a=>{a.contract.rows[0].SCOPE_MATCH=false;},
    a=>{a.contract.rows[0].COUNTRY_ID='UNMAPPED';},
    a=>{a.config.pdProvenance.scenarioId='fabricated-source';},
    a=>{a.config.pdOverrides[0].points[0].annualPd=.99;},
    a=>{a.contract.liveBackendConnected=true;},
  ];
  for(const patch of patches){const w=connectedWorkspace();patch(w.runs[0].payload.analysis);assert.throws(()=>validateWorkspaceData(w),/RiskCube snapshot/);}
  const w=connectedWorkspace();w.runs[0].payload.settings.cubeProjection=null;assert.throws(()=>validateWorkspaceData(w),/raw projection/);
});
test('scope intersection and changed portfolio coverage block execution without corrupting portable settings',()=>{
  const w=connectedWorkspace();
  w.facilities[0].sector='New unmapped sector';w.portfolioVersion=2;
  assert.doesNotThrow(()=>validateWorkspaceData(w));
  assert.equal(riskInputs(w.facilities,w.settings).bridge.valid,false);
  assert.equal(connectedContext(w.facilities,w.settings).result,null);
  w.settings.cubeProjection=null;
  const sectors=[...new Set(w.facilities.map(f=>f.sector))],countries=[...new Set(w.facilities.map(f=>f.country))];
  const [sector,country]=sectors.flatMap(s=>countries.map(c=>[s,c])).find(([s,c])=>!w.facilities.some(f=>f.sector===s&&f.country===c))||[];
  assert.ok(sector&&country,'Individually valid filters provide an empty sector-country intersection');
  w.settings.cubeConfig={...DEFAULT_CUBE_CONFIG,sector,country};
  assert.doesNotThrow(()=>validateWorkspaceData(w));
  assert.match(connectedContext(w.facilities,w.settings).error,/no facilities/);
});
test('retains more than 100 captures without silently pruning them',()=>{
  const w=workspace();w.runs=Array.from({length:101},(_,i)=>run('Pivot',{id:`run-${i}`}));assert.equal(validateWorkspaceData(w).runs.length,101);
});
test('rejects non-JSON values, circular data and oversized backups',()=>{
  for(const value of [NaN,Infinity,undefined,()=>{}]){const w=workspace();w.settings.extra=value;assert.throws(()=>validateWorkspaceData(w));}
  const circular=workspace();circular.settings.self=circular;assert.throws(()=>validateWorkspaceData(circular),/circular/);
  const large=workspace();large.settings.padding='x'.repeat(15_000_000);assert.throws(()=>validateWorkspaceData(large),/15 MB/);
});
test('loading corrupt persisted data preserves it and exposes a temporary recovery state',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let writes=0;const stored='{broken backup';
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:()=>writes++}});
  try {const result=storeExports.loadWorkspace();assert.ok(result.error.includes('not been overwritten'));assert.equal(result.workspace.facilities.length,18);assert.equal(writes,0);}
  finally {if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
test('CSV protects formula text including leading spaces, tabs, newline and BOM',()=>{
  for(const value of ['=1+1','+CMD','-1+2','@SUM(A1)','  =1+1','\n=1+1','\r=1+1','\t=1+1','\uFEFF=1+1',' \n @SUM(A1)','\nordinary text'])assert.ok(csvCell(value).startsWith('"\''),JSON.stringify(value));
});
test('CSV preserves real negative numeric values, quoting and safe text',()=>{
  assert.equal(csvCell(-3.25),'"-3.25"');assert.equal(csvCell('North "A", Bank'),'"North ""A"", Bank"');assert.equal(csvCell('ordinary text'),'"ordinary text"');assert.equal(csvCell(null),'""');
});
