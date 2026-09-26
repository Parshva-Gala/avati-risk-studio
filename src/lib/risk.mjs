// Educational, deterministic calculations. Amounts are USD millions; rates are fractions.
export const DEFAULT_ECL_SCENARIOS = [
  { id: 'baseline', name: 'Baseline', weight: 0.6, pdMultiplier: 1 },
  { id: 'upside', name: 'Upside', weight: 0.15, pdMultiplier: 0.75 },
  { id: 'downside', name: 'Downside', weight: 0.25, pdMultiplier: 1.6 },
];

export const STRESS_PRESETS = {
  baseline: { pdMultiplier: 1, lgdAdditive: 0, marketDecline: 0, incomeShock: 0, operationalLoss: 0, rwaUplift: 0 },
  adverse: { pdMultiplier: 1.75, lgdAdditive: 0.05, marketDecline: 0.08, incomeShock: 0.18, operationalLoss: 6, rwaUplift: 0.1 },
  severe: { pdMultiplier: 2.7, lgdAdditive: 0.1, marketDecline: 0.18, incomeShock: 0.36, operationalLoss: 14, rwaUplift: 0.2 },
};
export const DEFAULT_STRESS_CONFIG = {
  ...STRESS_PRESETS.adverse,
  capital: 280, rwa: 1750, annualIncome: 68, marketPortfolio: 110, taxRate: 0.25, hurdle: 0.105,
};

const inRange = (value, low, high, label) => {
  if (!Number.isFinite(value) || value < low || value > high) throw new Error(`${label} must be between ${low} and ${high}.`);
};
const borrowerKey = name => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

function validateFacilities(facilities) {
  if (!Array.isArray(facilities) || !facilities.length) throw new Error('Load at least one facility before calculating.');
  const ids = new Set();
  for (const f of facilities) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id.trim() || ids.has(f.id)) throw new Error('Every facility needs a unique ID.');
    ids.add(f.id);
    if (typeof f.borrower !== 'string' || !f.borrower.trim()) throw new Error(`${f.id}: borrower is required for stage contagion.`);
    if (typeof f.watchlist !== 'boolean') throw new Error(`${f.id}: watchlist must be true or false.`);
    for (const key of ['balance', 'undrawn', 'daysPastDue']) inRange(f[key], 0, Number.MAX_SAFE_INTEGER, `${f.id}: ${key}`);
    if (!Number.isInteger(f.daysPastDue)) throw new Error(`${f.id}: daysPastDue must be a whole number.`);
    for (const key of ['ccf', 'pd', 'lgd', 'rate']) inRange(f[key], 0, 1, `${f.id}: ${key}`);
    inRange(f.years, 1 / 365, 40, `${f.id}: years`);
    if (f.pdCurve !== undefined) {
      if (!Array.isArray(f.pdCurve) || f.pdCurve.length < Math.ceil(f.years)) throw new Error(`${f.id}: PD curve must cover every remaining year.`);
      f.pdCurve.forEach((pd, i) => inRange(pd, 0, 1, `${f.id}: PD curve year ${i + 1}`));
    }
  }
}

/** @param {Array<import('../types').Facility & {pdCurve?: number[]}>} facilities */
export function deriveStages(facilities) {
  validateFacilities(facilities);
  const initial = facilities.map(f => {
    const stage = f.daysPastDue >= 90 ? 3 : (f.daysPastDue > 30 || f.watchlist ? 2 : 1);
    const reasons = f.daysPastDue >= 90 ? ['90+ days past due'] : [
      ...(f.daysPastDue > 30 ? ['31–89 days past due'] : []),
      ...(f.watchlist ? ['Watchlist / significant credit risk increase'] : []),
    ];
    if (!reasons.length) reasons.push('Current / no configured SICR trigger');
    return { ...f, stage, ownStage: stage, reasons };
  });
  const worst = new Map();
  initial.forEach(f => worst.set(borrowerKey(f.borrower), Math.max(worst.get(borrowerKey(f.borrower)) || 1, f.stage)));
  return initial.map(f => {
    const stage = worst.get(borrowerKey(f.borrower));
    return { ...f, stage, reasons: stage > f.stage ? [...f.reasons, `Borrower contagion: another facility is Stage ${stage}`] : f.reasons };
  });
}

export function validateScenarioWeights(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return 'Add at least one economic scenario.';
  if (scenarios.some(s => !s || typeof s !== 'object' || Array.isArray(s))) return 'Each economic scenario must be a record.';
  if (scenarios.some(s => typeof s.id !== 'string' || !s.id.trim())) return 'Each economic scenario needs a non-empty ID.';
  if (scenarios.some(s => !Number.isFinite(s.weight) || s.weight < 0 || s.weight > 1)) return 'Each scenario weight must be between 0% and 100%.';
  const sum = scenarios.reduce((total, s) => total + s.weight, 0);
  if (Math.abs(sum - 1) > 0.000001) return `Scenario weights total ${(sum * 100).toFixed(1)}%; they must total 100%.`;
  if (scenarios.some(s => !Number.isFinite(s.pdMultiplier) || s.pdMultiplier < 0 || s.pdMultiplier > 10)) return 'Each PD multiplier must be between 0 and 10.';
  if (new Set(scenarios.map(s => s.id)).size !== scenarios.length) return 'Scenario IDs must be unique.';
  return null;
}

function facilityTrace(facility, pdMultiplier = 1, lgdAdditive = 0) {
  const ead = facility.balance + facility.undrawn * facility.ccf;
  const annualPd = facility.stage === 3 ? 1 : Math.min(1, (facility.pdCurve?.[0] ?? facility.pd) * pdMultiplier);
  const lgd = Math.min(1, Math.max(0, facility.lgd + lgdAdditive));
  const horizon = facility.stage === 1 ? Math.min(1, facility.years) : facility.years;
  const periods = [];
  let survival = 1;
  for (let start = 0; start < horizon - 1e-10; start += 1) {
    const duration = Math.min(1, horizon - start);
    const time = start + duration;
    const periodAnnualPd = facility.stage === 3 ? 1 : Math.min(1, (facility.pdCurve?.[start] ?? facility.pd) * pdMultiplier);
    // log1p/expm1 avoid rounding a small, positive PD down to zero.
    const conditionalPd = -Math.expm1(duration * Math.log1p(-periodAnnualPd));
    const marginalPd = survival * conditionalPd;
    const discountFactor = 1 / Math.pow(1 + facility.rate, time);
    const loss = ead * lgd * marginalPd * discountFactor;
    periods.push({ year: periods.length + 1, time, ead, annualPd: periodAnnualPd, marginalPd, survival, lgd, discountFactor, loss });
    survival *= 1 - conditionalPd;
    if (survival === 0) break;
  }
  return { ead, annualPd, lgd, horizon, periods, ecl: periods.reduce((sum, p) => sum + p.loss, 0) };
}

/** @param {Array<import('../types').Facility & {pdCurve?: number[]}>} facilities */
export function calculateECL(facilities, scenarios = DEFAULT_ECL_SCENARIOS) {
  const error = validateScenarioWeights(scenarios);
  if (error) throw new Error(error);
  const staged = deriveStages(facilities);
  const rows = staged.map(f => {
    const scenarioResults = scenarios.map(s => ({ ...s, ...facilityTrace(f, s.pdMultiplier) }));
    const weightedEcl = scenarioResults.reduce((sum, s) => sum + s.ecl * s.weight, 0);
    return { ...f, ead: scenarioResults[0].ead, weightedEcl, scenarios: scenarioResults };
  });
  const ead = rows.reduce((sum, f) => sum + f.ead, 0);
  const weightedEcl = rows.reduce((sum, f) => sum + f.weightedEcl, 0);
  const stageTotals = [1, 2, 3].map(stage => {
    const selected = rows.filter(f => f.stage === stage);
    return { stage, count: selected.length, ead: selected.reduce((sum, f) => sum + f.ead, 0), ecl: selected.reduce((sum, f) => sum + f.weightedEcl, 0) };
  });
  return {
    ead, weightedEcl, coverage: ead ? weightedEcl / ead : 0, stageTotals, facilities: rows,
    scenarios: scenarios.map((s, i) => ({ ...s, ecl: rows.reduce((sum, f) => sum + f.scenarios[i].ecl, 0) })),
  };
}

export function calculateCapitalImpact(creditLoss, config = DEFAULT_STRESS_CONFIG, additionalRwa = 0) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Stress settings must be a record.');
  const c = { ...DEFAULT_STRESS_CONFIG, ...config };
  for (const key of ['capital', 'annualIncome', 'marketPortfolio', 'operationalLoss']) inRange(c[key], 0, Number.MAX_SAFE_INTEGER, key);
  inRange(c.rwa, Number.EPSILON, Number.MAX_SAFE_INTEGER, 'RWA');
  inRange(c.pdMultiplier, 0, 10, 'PD multiplier');
  for (const key of ['lgdAdditive', 'marketDecline', 'incomeShock', 'rwaUplift', 'taxRate', 'hurdle']) inRange(c[key], 0, 1, key);
  inRange(creditLoss, 0, Number.MAX_SAFE_INTEGER, 'Incremental credit loss');
  inRange(additionalRwa, 0, Number.MAX_SAFE_INTEGER, 'Additional RWA');
  const marketLoss = c.marketPortfolio * c.marketDecline;
  const incomeLoss = c.annualIncome * c.incomeShock;
  const operationalLoss = c.operationalLoss;
  const preTaxLoss = creditLoss + marketLoss + incomeLoss + operationalLoss;
  const taxBenefit = Math.min(preTaxLoss, c.annualIncome) * c.taxRate;
  const afterTaxLoss = preTaxLoss - taxBenefit;
  const capitalAfter = c.capital - afterTaxLoss;
  const rwaAfter = c.rwa * (1 + c.rwaUplift) + additionalRwa;
  return {
    config: c, creditLoss, marketLoss, incomeLoss, operationalLoss, preTaxLoss, taxBenefit, afterTaxLoss, additionalRwa,
    capitalBefore: c.capital, capitalAfter, rwaBefore: c.rwa, rwaAfter,
    carBefore: c.capital / c.rwa, carAfter: capitalAfter / rwaAfter,
    headroom: capitalAfter / rwaAfter - c.hurdle,
    bridge: [
      { label: 'Opening capital', value: c.capital, kind: 'total' },
      { label: 'Credit loss', value: -creditLoss, kind: 'loss' },
      { label: 'Market loss', value: -marketLoss, kind: 'loss' },
      { label: 'Income pressure', value: -incomeLoss, kind: 'loss' },
      { label: 'Operational loss', value: -operationalLoss, kind: 'loss' },
      { label: 'Tax benefit', value: taxBenefit, kind: 'benefit' },
      { label: 'Stressed capital', value: capitalAfter, kind: 'total' },
    ],
  };
}

/** @param {Array<import('../types').Facility & {pdCurve?: number[]}>} facilities */
export function calculateStress(facilities, config = DEFAULT_STRESS_CONFIG) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Stress settings must be a record.');
  const c = { ...DEFAULT_STRESS_CONFIG, ...config };
  // Validate settings before calculating the facility loss trace.
  calculateCapitalImpact(0, c);
  const staged = deriveStages(facilities);
  const baselineEcl = staged.reduce((sum, f) => sum + facilityTrace(f).ecl, 0);
  const stressedEcl = staged.reduce((sum, f) => sum + facilityTrace(f, c.pdMultiplier, c.lgdAdditive).ecl, 0);
  const creditLoss = Math.max(0, stressedEcl - baselineEcl);
  return { ...calculateCapitalImpact(creditLoss, c), baselineEcl, stressedEcl };
}
