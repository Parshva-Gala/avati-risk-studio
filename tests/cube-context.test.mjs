import test from 'node:test';
import assert from 'node:assert/strict';
import { riskInputs, connectedContext, aggregateCube } from '../src/lib/cube-context.mjs';
import { calculateECL, calculateStress, STRESS_PRESETS } from '../src/lib/risk.mjs';
import { DEFAULT_CUBE_CONFIG, runCube } from '../src/lib/cube.mjs';

const facilities = () => [
  { id:'A', borrower:'Synthetic A', sector:'Manufacturing', country:'Jordan', currency:'USD', balance:100, undrawn:0, ccf:0.5, pd:0.01, lgd:0.5, years:2, rate:0, daysPastDue:45, watchlist:false, esgScore:60, emissions:1000, enterpriseValue:500, revenue:200, green:false },
  { id:'B', borrower:'Synthetic B', sector:'Utilities', country:'Iraq', currency:'USD', balance:50, undrawn:0, ccf:0.5, pd:0.01, lgd:0.4, years:2, rate:0, daysPastDue:45, watchlist:false, esgScore:70, emissions:500, enterpriseValue:250, revenue:100, green:true },
];
const selection = { bankId:'TEST', modelDate:'2026-09-27', mefDate:'2026-09-27', scenarioId:'BASE', firstYear:2027, pdUnit:'fraction', pdBasis:'annual-conditional', segmentMap:{} };
const projectionRows = () => facilities().flatMap((f,index)=>[0,1].map(year=>({ BANK_ID:'TEST', IFRS_MODEL_UPDATION_DATE:'2026-09-27', MEF_DATE:'2026-09-27', SCENARIO_ID:'BASE', IFRS_SEGMENT_ID:f.sector, COUNTRY_ID:null, PERIOD_YEAR:2027+year, PROJECTED_PD:(year+1)*(index===0?0.1:0.05) })));
const scenarios = [{id:'a',name:'Base',weight:0.5,pdMultiplier:1},{id:'b',name:'Downside',weight:0.5,pdMultiplier:2}];
const neutral = {...DEFAULT_CUBE_CONFIG,macroPdMultiplier:1,transitionPdMultiplier:1,physicalLgdAdditive:0,undrawnDrawdown:0,marketDecline:0,incomeShock:0,operationalLoss:0,rwaUplift:0,depositRunoff:0,hqlaHaircut:0};
const settings = () => ({ cubeConfig:neutral, cubeProjection:{rows:projectionRows(),selection}, eclScenarios:scenarios });
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('Native annual curves feed identical hand-calculated ECL in the connected run and standalone pages',()=>{
  const master=facilities(), configured=settings(), before=JSON.stringify(master);
  const calibrated=riskInputs(master,configured), context=connectedContext(master,configured);
  assert.equal(calibrated.error,''); assert.equal(context.error,'');
  const ecl=calculateECL(calibrated.facilities,scenarios);
  // A: .5*[50*(.1+.9*.2)+50*(.2+.8*.4)] = 20.
  // B: .5*[20*(.05+.95*.1)+20*(.1+.9*.2)] = 4.25.
  close(ecl.weightedEcl,24.25);
  close(context.result.reportingEcl.weightedEcl,ecl.weightedEcl);
  close(context.result.baseline.ecl,16.9);
  const stress=calculateStress(calibrated.facilities,{...STRESS_PRESETS.baseline});
  close(stress.baselineEcl,context.result.baseline.ecl); close(stress.creditLoss,0);
  assert.deepEqual(ecl.facilities[0].scenarios[0].periods.map(p=>p.annualPd),[0.1,0.2]);
  assert.equal(JSON.stringify(master),before,'Shared master must retain its original raw calibration.');
});

test('A changed portfolio revalidates imported coverage and blocks connected results instead of using master PD',()=>{
  const master=[...facilities(),{...facilities()[0],id:'NEW',borrower:'New synthetic borrower',sector:'New unmapped segment'}];
  const calibrated=riskInputs(master,settings()), context=connectedContext(master,settings());
  assert.notEqual(calibrated.error,''); assert.equal(calibrated.bridge.valid,false);
  assert.equal(calibrated.bridge.facilityCurves.length,0);
  assert.equal(context.result,null); assert.match(context.error,/NEW|missing/i);
});

test('Extending maturity beyond the imported projection blocks all curve consumers',()=>{
  const master=facilities().map(f=>f.id==='A'?{...f,years:3}:f);
  const calibrated=riskInputs(master,settings()), context=connectedContext(master,settings());
  assert.match(calibrated.error,/2029/); assert.equal(context.result,null);
});

test('Bank presentation selection leaves connected financial outputs and period traces identical',()=>{
  const results=['midbank','jkb','jcb','nbi'].map(bank=>runCube(facilities(),{...neutral,bank}, {},scenarios));
  for(const result of results.slice(1)) {
    assert.deepEqual(result.summary,results[0].summary);
    assert.deepEqual(result.facilities,results[0].facilities);
    assert.deepEqual(result.liquidity,results[0].liquidity);
  }
});

test('Connected pivot aggregates tie to the underlying facility, sector and bank outputs',()=>{
  const {result}=connectedContext(facilities(),settings());
  for(const dimension of ['sector','country','borrower']) {
    for(const [measure,expected] of [['baselineEcl',result.baseline.ecl],['stressedEcl',result.stressed.ecl],['incrementalEcl',result.capital.creditLoss],['baseEad',result.baseline.ead],['stressEad',result.stressed.ead]]) {
      const groups=aggregateCube(result,dimension,measure);
      close(groups.reduce((sum,g)=>sum+g.value,0),expected);
      assert.equal(groups.reduce((sum,g)=>sum+g.count,0),facilities().length);
      close(groups.reduce((sum,g)=>sum+g.balance,0),result.baseline.ead);
    }
  }
  const scoped=aggregateCube(result,'country','stressedEcl','Manufacturing');
  close(scoped.reduce((sum,g)=>sum+g.value,0),result.sectors.find(s=>s.sector==='Manufacturing').stressedEcl);
  assert.equal(scoped.length,1); assert.equal(scoped[0].key,'Jordan');
});
