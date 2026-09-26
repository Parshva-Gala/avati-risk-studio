import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPortfolio } from '../src/lib/portfolio.mjs';
import { buildRiskCubeProjection, validateRiskCubeProjectionInput } from '../src/lib/riskcube-adapter.mjs';
import { runCube } from '../src/lib/cube.mjs';
const facilities=()=>demoPortfolio().slice(0,2).map(f=>({...f,years:2}));
const selection=()=>({bankId:'DEMO',modelDate:'2026-09-27',mefDate:'2026-09-27',scenarioId:'2',firstYear:2027,pdUnit:'fraction',pdBasis:'annual-conditional'});
const rows=()=>facilities().flatMap(f=>[2027,2028].map((year,i)=>({BANK_ID:'DEMO',IFRS_MODEL_UPDATION_DATE:'2026-09-27',MEF_DATE:'2026-09-27',SCENARIO_ID:2,IFRS_SEGMENT_ID:f.sector,COUNTRY_ID:'',PERIOD_YEAR:year,PROJECTED_PD:.03+i*.01})));
test('native exported columns become complete facility PD term structures',()=>{
 const r=buildRiskCubeProjection(facilities(),rows(),selection());assert.equal(r.valid,true);assert.equal(r.coverage,1);assert.deepEqual(r.facilityCurves[0].points,[{year:1,annualPd:.03},{year:2,annualPd:.04}]);assert.equal(r.provenance.scenarioId,'2');assert.equal(r.facilities[0].pd,.03);
});
test('fraction and percent units are explicit and equivalent',()=>{
 const percentRows=rows().map(r=>({...r,PROJECTED_PD:r.PROJECTED_PD*100}));
 const a=buildRiskCubeProjection(facilities(),rows(),selection()), b=buildRiskCubeProjection(facilities(),percentRows,{...selection(),pdUnit:'percent'});assert.deepEqual(a.facilityCurves,b.facilityCurves);
 assert.equal(buildRiskCubeProjection(facilities(),percentRows,selection()).valid,false);
});
test('missing year or missing segment blocks every curve without silent fallback',()=>{
 const r=buildRiskCubeProjection(facilities(),rows().slice(0,-1),selection());assert.equal(r.valid,false);assert.equal(r.coverage,.5);assert.deepEqual(r.facilityCurves,[]);assert.deepEqual(r.facilities,[]);assert.ok(r.errors.some(s=>s.includes('2028')));
});
test('country and segment IDs need explicit exact mapping',()=>{
 const source=rows().map(r=>({...r,IFRS_SEGMENT_ID:r.IFRS_SEGMENT_ID==='Agriculture'?'SEG-A':'SEG-R',COUNTRY_ID:7}));
 assert.equal(buildRiskCubeProjection(facilities(),source,selection()).valid,false);
 const mapped=buildRiskCubeProjection(facilities(),source,{...selection(),segmentMap:{Agriculture:{segmentId:'SEG-A',countryId:'7'},'Renewable energy':{segmentId:'SEG-R',countryId:7}}});assert.equal(mapped.valid,true);
});
test('duplicate native keys fail even when values match',()=>{
 const source=rows();source.push({...source[0]});const r=buildRiskCubeProjection(facilities(),source,selection());assert.equal(r.valid,false);assert.ok(r.errors.some(s=>s.includes('Duplicate')));
});
test('different scenario or data vintages cannot fill selected coverage',()=>{
 const source=rows();source[3].SCENARIO_ID=3;assert.equal(buildRiskCubeProjection(facilities(),source,selection()).valid,false);
 source[3].SCENARIO_ID=2;source[3].MEF_DATE='2026-08-27';assert.equal(buildRiskCubeProjection(facilities(),source,selection()).valid,false);
});
test('PD values, period basis and incomplete upstream statuses fail clearly',()=>{
 for(const pd of ['',null,NaN,-.1,1.01,'5%']){const source=rows();source[0].PROJECTED_PD=pd;assert.equal(buildRiskCubeProjection(facilities(),source,selection()).valid,false);}
 for(const patch of [{pdBasis:'cumulative'},{pdUnit:'auto'},{firstYear:1},{executionStatus:'STARTED'}])assert.equal(buildRiskCubeProjection(facilities(),rows(),{...selection(),...patch}).valid,false);
});
test('CSV numeric strings and midnight SQL dates normalize without changing source',()=>{
 const source=rows().map(r=>({...r,IFRS_MODEL_UPDATION_DATE:'2026-09-27 00:00:00.000',PROJECTED_PD:String(r.PROJECTED_PD),PERIOD_YEAR:String(r.PERIOD_YEAR)}));const before=JSON.stringify(source);assert.equal(buildRiskCubeProjection(facilities(),source,selection()).valid,true);assert.equal(JSON.stringify(source),before);
});
test('shape validation permits portfolio coverage to be reevaluated later',()=>{
 assert.deepEqual(validateRiskCubeProjectionInput(rows(),selection()),[]);const changed=[...facilities(),{...facilities()[0],id:'NEW',sector:'Missing segment'}];assert.equal(buildRiskCubeProjection(changed,rows(),selection()).valid,false);
});
test('native export curves actually drive the connected period-by-period ECL run',()=>{
 const portfolio=facilities().map(f=>({...f,watchlist:true}));const imported=buildRiskCubeProjection(portfolio,rows(),selection());
 const result=runCube(portfolio,{pdOverrides:imported.facilityCurves,pdProvenance:imported.provenance,macroPdMultiplier:1,transitionPdMultiplier:1,physicalLgdAdditive:0,undrawnDrawdown:0});
 assert.deepEqual(result.facilities[0].baselinePeriods.map(p=>p.annualPd),[.03,.04]);
 assert.equal(result.config.pdProvenance.dataFingerprint,imported.provenance.dataFingerprint);
 assert.equal(result.facilities[0].pdSource,'RiskCube imported annual curve');
 assert.notEqual(result.baseline.ecl,runCube(portfolio).baseline.ecl);
 assert.equal(result.baseline.ecl,result.stressed.ecl);
});
