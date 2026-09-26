import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateECL, calculateStress, deriveStages, validateScenarioWeights, STRESS_PRESETS } from '../src/lib/risk.mjs';

const fixture = (overrides = {}) => ({ id: 'F1', borrower: 'Example borrower', balance: 100, undrawn: 20, ccf: 0.5, pd: 0.1, lgd: 0.4, years: 2, rate: 0.1, daysPastDue: 0, watchlist: false, ...overrides });
const base = [{ id: 'base', name: 'Base', weight: 1, pdMultiplier: 1 }];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('12-month ECL hand calculation: (100 + 20 × .5) × .1 × .4 / 1.1 = 4', () => {
  const result = calculateECL([fixture()], base);
  close(result.ead, 110); close(result.weightedEcl, 4);
  assert.equal(result.facilities[0].stage, 1);
  assert.equal(result.facilities[0].scenarios[0].periods.length, 1);
});
test('Lifetime marginal PD uses survival; year 2 is .9 × .1, discounted at 1.1²', () => {
  const result = calculateECL([fixture({ daysPastDue: 31 })], base);
  close(result.weightedEcl, 4 + 110 * 0.09 * 0.4 / 1.21);
  close(result.facilities[0].scenarios[0].periods[1].marginalPd, 0.09);
});
test('DPD boundaries, watchlist and borrower contagion remain explicit', () => {
  const rows = deriveStages([fixture({ id: 'A', daysPastDue: 30 }), fixture({ id: 'B', daysPastDue: 90 }), fixture({ id: 'C', borrower: 'Other', daysPastDue: 89 }), fixture({ id: 'D', borrower: 'Watch', watchlist: true })]);
  assert.deepEqual(rows.map(r => r.stage), [3, 3, 2, 2]);
  assert.deepEqual(rows.map(r => r.ownStage), [1, 3, 2, 2]);
  assert.match(rows[0].reasons.join(' '), /contagion/);
  close(calculateECL([fixture({ daysPastDue: 90 })], base).weightedEcl, 40);
});
test('Probability weighted ECL has hand-calculated weights and never normalizes an invalid total', () => {
  const result = calculateECL([fixture()], [{ id: 'a', weight: 0.75, pdMultiplier: 1 }, { id: 'b', weight: 0.25, pdMultiplier: 2 }]);
  close(result.weightedEcl, 5);
  assert.match(validateScenarioWeights([{ id: 'a', weight: 0.9, pdMultiplier: 1 }]), /100%/);
  assert.throws(() => calculateECL([fixture()], [{ id: 'a', weight: 0.9, pdMultiplier: 1 }]), /100%/);
});
test('Zero exposure and fractional maturities are finite; PD shock caps at 100%', () => {
  close(calculateECL([fixture({ balance: 0, undrawn: 0 })], base).coverage, 0);
  close(calculateECL([fixture({ years: 0.5 })], base).weightedEcl, 110 * 0.4 * (1 - Math.sqrt(0.9)) / Math.sqrt(1.1));
  const result = calculateECL([fixture({ pd: 0.8 })], [{ id: 'a', weight: 1, pdMultiplier: 2 }]);
  close(result.weightedEcl, 40);
});
test('No-shock capital and RWA remain unchanged; stressed bridge reconciles exactly', () => {
  const unchanged = calculateStress([fixture()], { ...STRESS_PRESETS.baseline, capital: 100, rwa: 500 });
  close(unchanged.afterTaxLoss, 0); close(unchanged.carAfter, 0.2);
  const result = calculateStress([fixture()], { ...STRESS_PRESETS.baseline, capital: 100, rwa: 500, annualIncome: 20, marketPortfolio: 100, marketDecline: 0.1, incomeShock: 0.5, operationalLoss: 5, taxRate: 0.25, rwaUplift: 0.2 });
  // Loss = 10 + 10 + 5 = 25; taxable-profit cap permits 20 × .25 = 5 benefit.
  close(result.afterTaxLoss, 20); close(result.capitalAfter, 80); close(result.rwaAfter, 600); close(result.carAfter, 80 / 600);
  close(result.bridge.slice(0, -1).reduce((sum, item) => sum + item.value, 0), result.capitalAfter);
});
test('Missing values and invalid risk parameters fail loudly', () => {
  assert.throws(() => calculateECL([fixture({ pd: NaN })], base), /pd/);
  assert.throws(() => calculateECL([fixture({ balance: -1 })], base), /balance/);
  assert.throws(() => calculateECL([fixture(), fixture()], base), /unique/);
  assert.throws(() => calculateStress([fixture()], { rwa: 0 }), /RWA/);
});
test('Whitespace-equivalent borrower names receive the same contagion result as ESG grouping', () => {
  const rows = deriveStages([fixture({ id: 'A', borrower: '  EXAMPLE   borrower ', daysPastDue: 90 }), fixture({ id: 'B', borrower: 'Example borrower' })]);
  assert.deepEqual(rows.map(r => r.stage), [3, 3]);
  assert.equal(rows[1].ownStage, 1);
});
test('A positive PD below floating-point subtraction precision still produces positive ECL', () => {
  const result = calculateECL([fixture({ pd: 1e-20, balance: 100, undrawn: 0, lgd: 0.5, rate: 0 })], base);
  assert.ok(result.weightedEcl > 0);
  assert.ok(Math.abs(result.weightedEcl / 5e-19 - 1) < 1e-12);
});
test('Malformed restored records and truthy watchlist strings cannot become valid calculations', () => {
  assert.match(validateScenarioWeights([null]), /record/);
  assert.match(validateScenarioWeights([{weight:1,pdMultiplier:1}]), /ID/);
  assert.throws(() => calculateECL([fixture({ watchlist: 'false' })], base), /watchlist/);
  assert.throws(() => calculateECL([fixture({ daysPastDue: 30.5 })], base), /whole number/);
  assert.throws(() => calculateECL([null], base), /unique ID/);
  assert.throws(() => calculateStress([fixture()], null), /settings/);
});
