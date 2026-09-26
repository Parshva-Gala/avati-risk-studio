import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runJKBStress, validateJKBConfig, createPublicJKBExample, JKB_CASES, getJKBRequiredInputs } from '../src/lib/jkb-stress.mjs';
import { runCube } from '../src/lib/cube.mjs';

const facility = (patch = {}) => ({ id: 'A', borrower: 'Alpha', sector: 'Manufacturing', country: 'Jordan', currency: 'USD', balance: 100, undrawn: 0, ccf: .5, pd: .1, lgd: .4, years: 2, rate: 0, daysPastDue: 0, watchlist: false, esgScore: 50, emissions: 100, enterpriseValue: 500, revenue: 100, green: false, ...patch });
const book = [facility(), facility({ id: 'B', borrower: 'Beta', balance: 50, pd: .2, lgd: .5, daysPastDue: 45 }), facility({ id: 'C', borrower: 'Gamma', balance: 20, lgd: .6, daysPastDue: 100 })];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const config = (caseId, shock = {}, patch = {}) => ({ ...createPublicJKBExample(), caseId, overrides: { [caseId]: { MODERATE: shock } }, ...patch });

test('Migration hand calculation releases performing allowances, charges new default loss once, and links RWA/CET1/T2', () => {
  const r = runJKBStress(book, config('credit-migration', { pct: .25 }));
  // Base: 4 + 9 + 12 = 25. Migrate 25%: release 1+2.25, add 10+6.25 => +13.
  near(r.baseline.ecl, 25); near(r.stressed.ecl, 38); near(r.impact.pbt, -13);
  near(r.stages[0].exposureAfter, 75); near(r.stages[1].exposureAfter, 37.5); near(r.stages[2].exposureAfter, 57.5);
  near(r.stages[2].eclAfter, 28.25); near(r.stages[2].rwaAfter, 43.875);
  near(r.stressed.cet1, 240.25); near(r.stressed.t2, 39); near(r.stressed.totalCapital, 289.25);
  near(r.impact.rwaCredit, -3.375); assert.ok(r.checks.every(c => c.status === 'PASS'));
});
test('NPA growth is measured against existing NPA stock and capped at available performing exposure', () => {
  const r = runJKBStress(book, config('credit-npa-growth', { pct: .5 }));
  near(r.stages[2].exposureAfter, 30); near(r.impact.ecl, 52 * 10 / 150);
  const capped = runJKBStress(book, config('credit-npa-growth', { pct: 100 }));
  near(capped.stages[0].exposureAfter, 0); near(capped.stages[1].exposureAfter, 0);
  assert.match(capped.warnings.join(' '), /capped/); near(capped.stressed.ead, capped.baseline.ead);
});
test('Largest-borrower concentration ranks total borrower exposure and applies cross-sector contagion without duplicate charge', () => {
  const rows = [facility({ id: 'A1', borrower: ' ACME ', balance: 40 }), facility({ id: 'A2', borrower: 'acme', sector: 'Services', balance: 80 }), facility({ id: 'B', borrower: 'Other', balance: 110 })];
  const r = runJKBStress(rows, config('credit-concentration', { numCustomers: 1 }, { sector: 'Manufacturing' }));
  near(r.stages[2].exposureAfter, 120); near(r.impact.ecl, 120 * (.4 - .04));
  assert.equal(r.concentration.filter(x => x.selected).length, 1); assert.equal(r.concentration[0].count, 2);
  assert.throws(() => runJKBStress(rows, config('credit-migration', {}, { sector: 'Not present' })), /No portfolio facilities/);
});
test('FX translation, open-position P&L and FX RWA use distinct reconciled components', () => {
  const r = runJKBStress(book, config('market-fx', { pct: .1 }));
  near(r.stressed.ead, 153); near(r.impact.ecl, -2.5); near(r.impact.pbt, 2.5 - 6);
  near(r.impact.rwaMarket, 4); near(r.stressed.totalCapital, 296.975);
});
test('Interest shock is a rate fraction (200 bps), not 2%, twice converted; source operational RWA linkage persists', () => {
  const r = runJKBStress(book, config('market-rates', { pct: .02 }));
  near(r.impact.pbt, (800 - 1000) * .02); near(r.impact.rwaOperational, -4 / 3 * .15 * 12.5);
  near(r.impact.ecl, 0); near(r.impact.rwaCredit, 0);
});
test('Price return and signed fixed loss flow through profit; tax losses receive no assumed tax credit', () => {
  const market = runJKBStress(book, config('market-price', { pct: -.2 })); near(market.impact.pbt, -24);
  const operational = runJKBStress(book, config('operational-loss', { amount: -100 }));
  near(operational.stressed.pbt, -30); near(operational.stressed.pat, -30); near(operational.impact.cet1, -82.5);
  const profit = runJKBStress(book, config('profit-change', { pct: -.1, amount: -3 })); near(profit.impact.pbt, -10);
});
test('Deposit runoff affects only selected contributions and distinct ASF/RSF changes', () => {
  const r = runJKBStress(book, config('liquidity-runoff', { pct: .1 }));
  near(r.stressed.hqla, 330); near(r.stressed.outflows, 288); near(r.stressed.inflows, 80);
  near(r.stressed.lcr, 330 / 208); near(r.stressed.asf, 1040); near(r.stressed.rsf, 890); near(r.stressed.nsfr, 1040 / 890);
  near(r.stressed.liquidAssets, 475); near(r.stressed.liquidLiabilities, 930); near(r.impact.pbt, 0);
});
test('Asset depletion holds liabilities/outflows fixed; deposit-only shock holds assets/HQLA fixed', () => {
  const a = runJKBStress(book, config('liquidity-assets', { pct: .1 }));
  near(a.stressed.hqla, 330); near(a.stressed.inflows, 76); near(a.impact.outflows, 0); near(a.impact.liquidLiabilities, 0);
  const d = runJKBStress(book, config('liquidity-deposit-change', { pct: -.1 }));
  near(d.impact.hqla, 0); near(d.impact.liquidAssets, 0); near(d.stressed.outflows, 288); near(d.stressed.liquidLiabilities, 930);
});
test('Depositor concentration uses depositor records; each severity is independent and missing ranks block', () => {
  const r = runJKBStress(book, config('liquidity-concentration', { numCustomers: 1 }));
  near(r.summary.withdrawal, 180); near(r.stressed.hqla, 350 - 200 * .18); near(r.stressed.lcr, 314 / 205.6);
  near(r.comparison.find(c => c.severity === 'MEDIUM').summary.withdrawal, 400);
  assert.throws(() => runJKBStress(book, config('liquidity-concentration', { numCustomers: 6 })), /at least 6 depositor/);
});
test('Drawdown cash and incremental EAD after CCF reconcile once into liquidity, ECL and funding', () => {
  const r = runJKBStress([facility({ undrawn: 20 })], config('liquidity-drawdown', { pct: .5 }));
  near(r.baseline.ead, 110); near(r.stressed.ead, 115); near(r.summary.drawdown, 10); near(r.impact.ecl, .2);
  near(r.stressed.hqla, 340); near(r.impact.outflows, 0); near(r.impact.rsf, 8.5); assert.ok(r.checks.every(c => c.status === 'PASS'));
});
test('Connected RiskCube imported annual calibration is reused, without charging its stressed capital again', () => {
  const f = facility({ daysPastDue: 45 });
  const cube = runCube([f], { pdOverrides: [{ facilityId: f.id, segmentId: 'SEG', countryId: null, points: [{ year: 1, annualPd: .2 }, { year: 2, annualPd: .3 }] }] });
  const r = runJKBStress([f], config('credit-migration', { pct: .25 }), cube);
  near(r.baseline.ecl, 100 * .4 * (.2 + .8 * .3)); near(r.stressed.ecl, 17.6 * .75 + 40 * .25);
  near(r.impact.pbt, -(40 - 17.6) * .25); assert.equal(r.creditSource, 'Connected RiskCube deterministic baseline');
  assert.throws(() => runJKBStress([facility({ balance: 101 })], config('credit-migration'), cube), /stale/);
});
test('Native amounts retain explicit units, ignore shared facility balances, and missing inputs never inherit silently', () => {
  const c = config('credit-migration', { pct: .1 }, { basis: 'workbook', currency: 'JOD', amountUnit: 'thousands' });
  const a = runJKBStress([], c); const b = runJKBStress([facility({ balance: 900000 })], c);
  near(a.baseline.ead, 1000); assert.deepEqual(a.summary, b.summary); assert.equal(a.units.currency, 'JOD');
  assert.throws(() => runJKBStress([], { ...c, inputs: { ...c.inputs, taxRate: null }, source: { missingInputs: ['taxRate'] } }), /input gaps/);
  assert.throws(() => validateJKBConfig({ currency: 'JOD' }), /USD millions/);
});
test('Zero liquidity denominators remain unavailable, malformed drafts are rejected, and all 13 mechanisms execute', () => {
  const c = createPublicJKBExample(); c.inputs.outflows = 80; c.inputs.selectedOutflows = 0;
  const r = runJKBStress(book, { ...c, caseId: 'operational-loss' }); assert.equal(r.baseline.lcr, null); assert.match(r.warnings.join(' '), /unavailable/);
  assert.throws(() => validateJKBConfig({ inputs: { taxRate: null } }), /taxRate/);
  assert.throws(() => validateJKBConfig({ overrides: { 'market-rates': { MODERATE: { pct: NaN } } } }), /Shock rate/);
  for (const testCase of JKB_CASES) {
    const result = runJKBStress(book, { caseId: testCase.id }); assert.equal(result.schema, 'AVATI_JKB_STRESS_V1'); assert.ok(result.checks.every(c => c.status === 'PASS'), testCase.id);
  }
});
test('Native unrelated missing inputs remain null; only active required gaps block, and absent values never receive synthetic defaults', () => {
  const c = config('market-rates', { pct: .02 }, { basis: 'workbook', currency: 'JOD', amountUnit: 'units' });
  const required = new Set(getJKBRequiredInputs(c.caseId));
  c.inputs = Object.fromEntries(Object.entries(c.inputs).map(([key, value]) => [key, required.has(key) ? value : null]));
  c.source = { filename: 'native.xlsx', missingInputs: ['fxLong', 'maxEclStage1'] };
  const r = runJKBStress([], c);
  assert.equal(r.config.inputs.fxLong, null); assert.equal(r.config.inputs.maxEclStage1, null); near(r.impact.pbt, -4);
  assert.deepEqual(r.config.source.missingInputs, []);
  assert.throws(() => runJKBStress([], { ...c, caseId: 'market-fx' }), /fxLong/);
  const absent = { ...c.inputs }; delete absent.rsa;
  assert.throws(() => runJKBStress([], { ...c, inputs: absent }), /rsa/);
});
test('Imported provenance cannot silently relabel amounts or contradict the native case identity', () => {
  const c = config('market-rates', { pct: .02, amount: 0, numCustomers: 1 }, { basis: 'workbook', currency: 'JOD', amountUnit: 'units' });
  c.source = { currency: 'JOD', amountUnit: 'units', asOf: '2026-01-01', entity: 'DEMO', scenarioId: 'MR', elementId: 'MR1', severity: 'MODERATE', caseKey: JSON.stringify(['2026-01-01', 'DEMO', 'MR', 'MR1', 'MODERATE']) };
  assert.doesNotThrow(() => validateJKBConfig(c));
  assert.throws(() => validateJKBConfig({ ...c, currency: 'USD' }), /cannot be relabeled/);
  assert.throws(() => validateJKBConfig({ ...c, amountUnit: 'millions' }), /cannot be relabeled/);
  assert.throws(() => validateJKBConfig({ ...c, source: { ...c.source, entity: 'CHANGED' } }), /case identity/);
  const result = runJKBStress([], c);
  assert.ok(result.comparison.filter(r => r.severity !== 'MODERATE').every(r => r.summary === null && /No complete native shock/.test(r.error)));
  assert.throws(() => validateJKBConfig({ ...c, severity: 'SEVERE' }), /No complete native shock/);
});
test('Zero starting EAD drawdown retains borrower-contagion stage and imported annual PD curve', () => {
  const rows = [facility({ id: 'EMPTY', balance: 0, undrawn: 20, ccf: 0, pd: .1, pdCurve: [.2, .3] }), facility({ id: 'SICR', balance: 50, borrower: 'Alpha', daysPastDue: 45, undrawn: 0 })];
  const r = runJKBStress(rows, config('liquidity-drawdown', { pct: .5 }));
  // EMPTY is Stage 2 by borrower contagion even though its own DPD is zero.
  // New EAD=10; lifetime marginal PD=.2 + .8*.3=.44; LGD=.4.
  near(r.impact.ecl, 10 * .44 * .4); near(r.stages[1].exposureAfter - r.stages[1].exposureBefore, 10);
});
