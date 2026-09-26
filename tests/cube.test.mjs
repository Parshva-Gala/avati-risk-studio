import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCube, DEFAULT_CUBE_CONFIG } from '../src/lib/cube.mjs';

const facility = (patch = {}) => ({ id: 'F1', borrower: 'Synthetic Example', sector: 'Manufacturing', country: 'Jordan', currency: 'USD',
  balance: 100, undrawn: 20, ccf: 0.5, pd: 0.1, lgd: 0.4, years: 2, rate: 0, daysPastDue: 0, watchlist: false,
  esgScore: 50, emissions: 1000, enterpriseValue: 500, revenue: 100, green: false, ...patch });
const neutral = { ...DEFAULT_CUBE_CONFIG, macroPdMultiplier: 1, transitionPdMultiplier: 1, physicalLgdAdditive: 0,
  undrawnDrawdown: 0, marketDecline: 0, incomeShock: 0, operationalLoss: 0, rwaUplift: 0, depositRunoff: 0, hqlaHaircut: 0 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('Connected hand calculation: credit delta reaches capital once, drawdown reaches EAD/RWA/liquidity once', () => {
  const result = runCube([facility()], { ...neutral, macroPdMultiplier: 2, physicalLgdAdditive: 0.1, undrawnDrawdown: 0.5,
    capital: 100, rwa: 500, annualIncome: 20, taxRate: 0.25, hqla: 100, netOutflows: 50, depositBase: 200, depositRunoff: 0.1 });
  // Starting EAD 110; drawn conversion 10 reduces undrawn by 10 => stressed EAD 115.
  // Starting ECL 110*.1*.4=4.4; stressed ECL 115*.2*.5=11.5; delta=7.1.
  close(result.baseline.ead, 110); close(result.stressed.ead, 115);
  close(result.baseline.ecl, 4.4); close(result.stressed.ecl, 11.5); close(result.capital.creditLoss, 7.1);
  close(result.capital.capitalAfter, 94.675); close(result.capital.rwaAfter, 505);
  close(result.liquidity.drawdown, 10); close(result.liquidity.depositOutflow, 20);
  close(result.liquidity.outflowsAfter, 80); close(result.liquidity.lcrAfter, 1.25);
  // Weighted reporting loss remains separate: 4.4*(.6+.15*.75+.25*1.6)=4.895.
  close(result.reportingEcl.weightedEcl, 4.895);
  assert.ok(result.checks.every(c => c.status === 'PASS'));
});
test('Scope intersects sector and country; macro applies globally but climate and drawdown do not leak', () => {
  const rows = [facility(), facility({ id: 'F2', borrower: 'Second', country: 'Iraq' }), facility({ id: 'F3', borrower: 'Third', sector: 'Utilities' })];
  const result = runCube(rows, { ...neutral, sector: 'Manufacturing', country: 'Jordan', macroPdMultiplier: 1.5, transitionPdMultiplier: 2, physicalLgdAdditive: 0.1, undrawnDrawdown: 0.5 });
  assert.deepEqual(result.facilities.map(r => r.scopeMatch), [true, false, false]);
  close(result.facilities[0].stressPd, 0.3); close(result.facilities[1].stressPd, 0.15);
  close(result.facilities[0].stressLgd, 0.5); close(result.facilities[1].stressLgd, 0.4);
  close(result.facilities[1].drawdown, 0); close(result.summary.scopeEad, 110);
});
test('Imported conditional yearly curves drive the shared marginal-PD engine with no flat-PD substitution', () => {
  const result = runCube([facility({ daysPastDue: 45 })], { ...neutral,
    pdOverrides: [{ facilityId: 'F1', segmentId: 'SEG-1', countryId: 'JO', points: [{ year: 1, annualPd: 0.1 }, { year: 2, annualPd: 0.2 }] }],
    pdProvenance: { source: 'RiskCube export', scenarioId: 'BASE', pdBasis: 'annual-conditional' } });
  // Year 1 .1; year 2 .9*.2 = .18. ECL=110*.4*(.1+.18)=12.32.
  close(result.baseline.ecl, 12.32); close(result.stressed.ecl, 12.32);
  close(result.facilities[0].periods[1].marginalPd, 0.18);
  close(result.capital.creditLoss, 0);
  assert.equal(result.contract.rows[0].IFRS_SEGMENT_ID, 'SEG-1');
  assert.equal(result.context.liveBackendConnected, false);
});
test('No-shock preserves capital, RWA and liquidity even though reporting ECL differs from deterministic base', () => {
  const result = runCube([facility()], neutral);
  close(result.capital.capitalAfter, neutral.capital); close(result.capital.rwaAfter, neutral.rwa);
  close(result.liquidity.lcrAfter, result.liquidity.lcrBefore);
  assert.notEqual(result.reportingEcl.weightedEcl, result.baseline.ecl);
  close(result.capital.creditLoss, 0);
});
test('ESG evidence joins by borrower; shared financed emissions allocate once without changing credit calibration', () => {
  const rows = [facility({ balance: 60 }), facility({ id: 'F2', balance: 40, sector: 'Utilities' })];
  const result = runCube(rows, neutral);
  close(result.summary.financedEmissions, 200);
  close(result.facilities[0].financedEmissions, 120); close(result.facilities[1].financedEmissions, 80);
  const betterScore = runCube(rows.map(f => ({ ...f, esgScore: 99 })), neutral);
  close(betterScore.stressed.ecl, result.stressed.ecl);
  assert.ok(result.checks.find(c => c.id === 'emissions-allocation').status === 'PASS');
});
test('Incomplete, duplicated or gapped imported curves and empty scopes block the integrated run', () => {
  const complete = { facilityId: 'F1', segmentId: 'S', countryId: 'C', points: [{ year: 1, annualPd: 0.1 }, { year: 2, annualPd: 0.2 }] };
  assert.throws(() => runCube([facility()], { ...neutral, pdOverrides: [{ ...complete, points: complete.points.slice(0, 1) }] }), /full remaining maturity/);
  assert.throws(() => runCube([facility()], { ...neutral, pdOverrides: [complete, complete] }), /unique/);
  assert.throws(() => runCube([facility()], { ...neutral, pdOverrides: [{ ...complete, points: [{ year: 1, annualPd: 0.1 }, { year: 3, annualPd: 0.2 }] }] }), /contiguous/);
  assert.throws(() => runCube([facility()], { ...neutral, sector: 'Not present' }), /no facilities/);
  assert.throws(() => runCube([facility()], { ...neutral, depositRunoff: NaN }), /depositRunoff/);
});
test('An explicit global native PD curve preserves its null country identity', () => {
  const result = runCube([facility()], { ...neutral, pdOverrides: [{ facilityId: 'F1', segmentId: 'GLOBAL-SEG', countryId: null, points: [{year:1,annualPd:0.1},{year:2,annualPd:0.1}] }] });
  assert.equal(result.facilities[0].countryId, null);
  assert.equal(result.contract.rows[0].COUNTRY_ID, null);
  assert.equal(result.contract.rows[0].PD_COUNTRY_SCOPE, 'global');
  assert.equal(result.facilities[0].country, 'Jordan');
});
