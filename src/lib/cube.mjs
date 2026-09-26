import { calculateECL, calculateCapitalImpact, DEFAULT_ECL_SCENARIOS } from './risk.mjs';
import { calculateESG, borrowerKey } from './esg.mjs';
import { validatePortfolio } from './portfolio.mjs';

export const DEFAULT_CUBE_CONFIG = {
  asOf: '2026-09-27', runId: 'local-preview', scenarioId: 'integrated-adverse', segmentId: 'all', sector: '', country: '',
  macroPdMultiplier: 1.5, transitionPdMultiplier: 1.25, physicalLgdAdditive: 0.05, undrawnDrawdown: 0.10,
  capital: 280, rwa: 1750, annualIncome: 68, marketPortfolio: 110, marketDecline: 0.08, incomeShock: 0.18,
  operationalLoss: 6, taxRate: 0.25, hurdle: 0.105, rwaUplift: 0.10, drawdownRwaWeight: 1,
  hqla: 350, netOutflows: 260, depositBase: 1000, depositRunoff: 0.05, hqlaHaircut: 0.03,
  pdOverrides: null, pdProvenance: null,
};

const sum = (rows, key) => rows.reduce((value, row) => value + row[key], 0);
const finiteRange = (value, low, high, name) => {
  if (!Number.isFinite(value) || value < low || value > high) throw new Error(`${name} must be between ${low} and ${high}.`);
};
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function validateCubeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Cube settings must be a record.');
  const c = { ...DEFAULT_CUBE_CONFIG, ...input };
  if (!isDate(c.asOf)) throw new Error('Cube as-of date must be a valid ISO date.');
  for (const key of ['runId', 'scenarioId', 'segmentId']) if (typeof c[key] !== 'string' || !c[key].trim()) throw new Error(`${key} is required.`);
  for (const key of ['sector', 'country']) if (typeof c[key] !== 'string') throw new Error(`${key} scope must be text.`);
  finiteRange(c.macroPdMultiplier, 1, 10, 'Macro PD multiplier');
  finiteRange(c.transitionPdMultiplier, 1, 10, 'Transition PD multiplier');
  for (const key of ['physicalLgdAdditive', 'undrawnDrawdown', 'depositRunoff', 'hqlaHaircut']) finiteRange(c[key], 0, 1, key);
  for (const key of ['hqla', 'depositBase']) finiteRange(c[key], 0, Number.MAX_SAFE_INTEGER, key);
  finiteRange(c.netOutflows, Number.EPSILON, Number.MAX_SAFE_INTEGER, 'Net liquidity outflows');
  finiteRange(c.drawdownRwaWeight, 0, 2.5, 'Drawdown RWA weight');
  calculateCapitalImpact(0, { ...c, pdMultiplier: 1, lgdAdditive: 0 });
  return c;
}

function prepareCurves(facilities, overrides) {
  if (overrides === null || overrides === undefined) return new Map();
  if (!Array.isArray(overrides) || !overrides.length) throw new Error('Imported PD curves must contain every facility.');
  const curves = new Map();
  const ids = new Set(facilities.map(f => f.id));
  let sharedStartYear;
  for (const curve of overrides) {
    if (!curve || typeof curve !== 'object' || typeof curve.facilityId !== 'string' || !ids.has(curve.facilityId) || curves.has(curve.facilityId)) throw new Error('Imported PD curves require unique, known facility IDs.');
    if (curve.segmentId === null || curve.segmentId === undefined || String(curve.segmentId).trim() === '' || curve.countryId === undefined || curve.countryId === '') throw new Error(`${curve.facilityId}: imported PD curve needs an explicit segment and country scope (null for global).`);
    if (!Array.isArray(curve.points) || !curve.points.length) throw new Error(`${curve.facilityId}: imported PD curve has no periods.`);
    const points = curve.points.map(p => {
      if (!p || !Number.isInteger(p.year) || p.year < 1) throw new Error(`${curve.facilityId}: each PD curve point needs a positive integer year.`);
      finiteRange(p.annualPd, 0, 1, `${curve.facilityId}: annual conditional PD`);
      return { year: p.year, annualPd: p.annualPd };
    }).sort((a, b) => a.year - b.year);
    if (points.some((p, i) => i > 0 && p.year !== points[i - 1].year + 1)) throw new Error(`${curve.facilityId}: PD curve years must be unique and contiguous.`);
    if (sharedStartYear === undefined) sharedStartYear = points[0].year;
    if (points[0].year !== sharedStartYear) throw new Error('All imported PD curves must share one starting forecast year.');
    curves.set(curve.facilityId, { ...curve, points });
  }
  for (const facility of facilities) {
    const curve = curves.get(facility.id);
    if (!curve || curve.points.length < Math.ceil(facility.years)) throw new Error(`${facility.id}: imported PD curve does not cover the full remaining maturity.`);
  }
  return curves;
}

/**
 * Connects shared portfolio, ESG evidence, PD curves, ECL, capital and liquidity.
 * @param {import('../types').Facility[]} facilities
 * @param {any} config
 * @param {any} esgConfig
 * @param {any} eclScenarios
 */
export function runCube(facilities, config = {}, esgConfig = {}, eclScenarios = DEFAULT_ECL_SCENARIOS) {
  const c = validateCubeConfig(config);
  const validated = validatePortfolio(facilities);
  if (validated.errors.length) throw new Error(validated.errors[0]);
  const master = validated.rows;
  const curves = prepareCurves(master, c.pdOverrides);
  const baseFacilities = master.map(f => {
    const curve = curves.get(f.id);
    return curve ? { ...f, pd: curve.points[0].annualPd, pdCurve: curve.points.map(p => p.annualPd) } : { ...f };
  });
  const inScope = f => (!c.sector || f.sector === c.sector) && (!c.country || f.country === c.country);
  const scoped = baseFacilities.filter(inScope);
  if (!scoped.length) throw new Error('The selected sector and country scope contains no facilities.');
  const esg = calculateESG(baseFacilities, { ...esgConfig, asOf: c.asOf });
  if (!esg.valid) throw new Error(`ESG inputs need attention: ${esg.issues.join(' ')}`);
  const esgByBorrower = new Map(esg.borrowers.map(b => [b.key, b]));
  const single = [{ id: 'deterministic-base', name: 'Deterministic base', weight: 1, pdMultiplier: 1 }];
  const baselineResult = calculateECL(baseFacilities, single);
  const reportingEcl = calculateECL(baseFacilities, eclScenarios);
  const shocked = baseFacilities.map(f => {
    const scopeMatch = inScope(f);
    const multiplier = c.macroPdMultiplier * (scopeMatch ? c.transitionPdMultiplier : 1);
    const drawdown = scopeMatch ? f.undrawn * c.undrawnDrawdown : 0;
    return {
      ...f, balance: f.balance + drawdown, undrawn: f.undrawn - drawdown,
      pd: Math.min(1, f.pd * multiplier), lgd: Math.min(1, f.lgd + (scopeMatch ? c.physicalLgdAdditive : 0)),
      ...(f.pdCurve ? { pdCurve: f.pdCurve.map(pd => Math.min(1, pd * multiplier)) } : {}),
    };
  });
  const stressedResult = calculateECL(shocked, single);
  const baselineById = new Map(baselineResult.facilities.map(f => [f.id, f]));
  const stressedById = new Map(stressedResult.facilities.map(f => [f.id, f]));
  const rows = baseFacilities.map(f => {
    const base = baselineById.get(f.id), stress = stressedById.get(f.id), borrower = esgByBorrower.get(borrowerKey(f.borrower));
    const scopeMatch = inScope(f), drawdown = scopeMatch ? f.undrawn * c.undrawnDrawdown : 0;
    const curve = curves.get(f.id);
    const financedEmissions = borrower?.financedEmissions === null || borrower?.financedEmissions === undefined ? null : borrower.balance ? borrower.financedEmissions * f.balance / borrower.balance : 0;
    return {
      id: f.id, borrower: f.borrower, sector: f.sector, country: f.country, scopeMatch, stage: base.stage,
      segmentId: curve?.segmentId ?? f.sector, countryId: curve ? curve.countryId : f.country,
      pdCountryScope: curve ? (curve.countryId === null ? 'global' : 'country-specific') : 'local-unmapped',
      basePd: base.scenarios[0].annualPd, stressPd: stress.scenarios[0].annualPd,
      baseLgd: f.lgd, stressLgd: stress.lgd, drawdown, baseEad: base.ead, stressEad: stress.ead,
      baselineEcl: base.weightedEcl, stressedEcl: stress.weightedEcl, incrementalEcl: stress.weightedEcl - base.weightedEcl,
      financedEmissions, esgScore: borrower?.score ?? null, esgEvidence: borrower?.evidenceState ?? 'Evidence pending',
      reasons: base.reasons, pdSource: curve ? 'RiskCube imported annual curve' : 'Facility master annual PD',
      pdCurve: curve?.points ?? null, periods: stress.scenarios[0].periods, baselinePeriods: base.scenarios[0].periods,
      lineage: [
        { node: 'portfolio', source: f.id, amount: f.balance },
        { node: 'segmentation', source: curve ? `IFRS segment ${curve.segmentId} / ${curve.countryId === null ? 'global country scope' : `country ${curve.countryId}`}` : `Local sector ${f.sector}`, scopeMatch },
        { node: 'esg', source: borrower?.key, evidence: borrower?.evidenceState, affectsPd: false },
        { node: 'pd', source: curve ? 'PROJECTED_PD_YEARWISE export' : 'Facility master', macroMultiplier: c.macroPdMultiplier, transitionMultiplier: scopeMatch ? c.transitionPdMultiplier : 1 },
        { node: 'ead', source: 'Undrawn-to-drawn conversion', drawdown, eadChange: stress.ead - base.ead },
        { node: 'ecl', source: 'Shared discounted marginal PD engine', baseline: base.weightedEcl, stressed: stress.weightedEcl },
        { node: 'capital', source: 'Incremental credit loss only', amount: stress.weightedEcl - base.weightedEcl },
      ],
    };
  });
  const sectorNames = [...new Set(rows.map(row => row.sector))].sort();
  const sectors = sectorNames.map(sector => {
    const selected = rows.filter(r => r.sector === sector), covered = selected.filter(r => r.financedEmissions !== null);
    return { sector, count: selected.length, scopeCount: selected.filter(r => r.scopeMatch).length,
      baseEad: sum(selected, 'baseEad'), stressEad: sum(selected, 'stressEad'), drawdown: sum(selected, 'drawdown'),
      baselineEcl: sum(selected, 'baselineEcl'), stressedEcl: sum(selected, 'stressedEcl'), incrementalEcl: sum(selected, 'incrementalEcl'),
      financedEmissions: covered.length ? sum(covered, 'financedEmissions') : null };
  });
  const creditDelta = stressedResult.weightedEcl - baselineResult.weightedEcl;
  const eadDelta = stressedResult.ead - baselineResult.ead;
  const capital = { ...calculateCapitalImpact(Math.max(0, creditDelta), { ...c, pdMultiplier: 1, lgdAdditive: 0 }, Math.max(0, eadDelta) * c.drawdownRwaWeight), baselineEcl: baselineResult.weightedEcl, stressedEcl: stressedResult.weightedEcl };
  const drawdown = sum(rows, 'drawdown'), depositOutflow = c.depositBase * c.depositRunoff;
  const hqlaAfter = c.hqla * (1 - c.hqlaHaircut), outflowsAfter = c.netOutflows + depositOutflow + drawdown;
  const liquidity = { lcrBefore: c.hqla / c.netOutflows, lcrAfter: hqlaAfter / outflowsAfter,
    hqlaBefore: c.hqla, hqlaAfter, hqlaLoss: c.hqla - hqlaAfter, outflowsBefore: c.netOutflows, outflowsAfter, drawdown, depositOutflow };
  const check = (id, label, expected, actual) => {
    const difference = actual - expected, tolerance = Math.max(1e-8, Math.abs(expected) * 1e-10);
    return { id, label, expected, actual, difference, status: Math.abs(difference) <= tolerance ? 'PASS' : 'FAIL' };
  };
  const checks = [
    check('facility-ecl', 'Facility stressed ECL equals engine output', stressedResult.weightedEcl, sum(rows, 'stressedEcl')),
    check('sector-ecl', 'Sector totals equal facility stressed ECL', sum(rows, 'stressedEcl'), sum(sectors, 'stressedEcl')),
    check('credit-delta', 'Capital receives incremental ECL exactly once', stressedResult.weightedEcl - baselineResult.weightedEcl, capital.creditLoss),
    check('ead-drawdown', 'EAD increases only by drawdown × (1 − CCF)', baseFacilities.reduce((total, f) => total + (inScope(f) ? f.undrawn * c.undrawnDrawdown * (1 - f.ccf) : 0), 0), eadDelta),
    check('capital-bridge', 'Opening capital plus bridge equals closing capital', capital.capitalAfter, sum(capital.bridge.slice(0, -1), 'value')),
    check('rwa-bridge', 'RWA combines base uplift and incremental exposure', c.rwa * (1 + c.rwaUplift) + eadDelta * c.drawdownRwaWeight, capital.rwaAfter),
    check('liquidity-bridge', 'Liquidity outflow bridge reconciles', c.netOutflows + depositOutflow + drawdown, liquidity.outflowsAfter),
  ];
  if (esg.summary.financedEmissions !== null) checks.push(check('emissions-allocation', 'Borrower footprint is allocated once across facilities', esg.summary.financedEmissions, rows.reduce((total, r) => total + (r.financedEmissions ?? 0), 0)));
  const context = { runId: c.runId, scenarioId: c.scenarioId, segmentId: c.segmentId, asOf: c.asOf,
    sector: c.sector || 'All sectors', country: c.country || 'All countries', modelVersion: 'avati-connected-risk-1.0',
    pdSource: curves.size ? 'RiskCube exported PD curve' : 'Facility master annual PD', pdProvenance: c.pdProvenance, liveBackendConnected: false };
  const nodes = [
    { id: 'portfolio', label: 'Shared portfolio', value: rows.length, status: 'PASS', detail: 'Validated facilities in USD millions; one master feeds every node.' },
    { id: 'segmentation', label: 'Segment & scope', value: scoped.length, status: 'PASS', detail: `${context.sector} · ${context.country}; climate overlays and drawdowns apply to matched facilities.` },
    { id: 'esg', label: 'ESG & climate evidence', value: esg.summary.financedEmissions === null ? 'Unavailable' : esg.summary.financedEmissions, status: esg.summary.evidenceCoverage === 1 ? 'PASS' : 'REVIEW', detail: 'Financed emissions and review evidence join each borrower; transmission is a separate explicit scenario assumption.' },
    { id: 'pd', label: 'PD & LGD transmission', value: `${c.macroPdMultiplier}× macro / ${c.transitionPdMultiplier}× transition`, status: 'PASS', detail: `${context.pdSource}; yearly survival PD, explicit scoped physical LGD increase.` },
    { id: 'ecl', label: 'Credit loss engine', value: stressedResult.weightedEcl, status: 'PASS', detail: 'Same engine measures starting ECL, stressed ECL and separately weighted reporting ECL.' },
    { id: 'capital', label: 'Capital & RWA', value: capital.carAfter, status: capital.headroom >= 0 ? 'PASS' : 'REVIEW', detail: 'Only stressed minus baseline credit loss enters the capital bridge; new EAD also feeds RWA.' },
    { id: 'liquidity', label: 'Liquidity impact', value: liquidity.lcrAfter, status: liquidity.lcrAfter >= 1 ? 'PASS' : 'REVIEW', detail: 'Scoped facility drawdowns and deposit runoff feed outflows; HQLA haircut is applied once.' },
    { id: 'controls', label: 'Reconcile & publish', value: `${checks.filter(c => c.status === 'PASS').length}/${checks.length}`, status: checks.every(c => c.status === 'PASS') ? 'PASS' : 'REVIEW', detail: 'Facility, sector, capital, RWA, liquidity and emissions controls accompany the output contract.' },
  ];
  const contract = { schema: 'AVATI_CONNECTED_RISK_OUTPUT_V1', mode: curves.size ? 'validated-export-input' : 'local-input', liveBackendConnected: false,
    context, rows: rows.map(row => ({ RUN_ID: c.runId, AS_OF_DATE: c.asOf, SCENARIO_ID: c.scenarioId, SEGMENT_SCOPE_ID: c.segmentId,
      FACILITY_ID: row.id, IFRS_SEGMENT_ID: curves.size ? row.segmentId : null, COUNTRY_ID: curves.size ? row.countryId : null,
      LOCAL_SECTOR: row.sector, PD_COUNTRY_SCOPE: row.pdCountryScope, SCOPE_MATCH: row.scopeMatch, STAGE: row.stage, PD_BASE: row.basePd, PD_STRESS: row.stressPd,
      LGD_BASE: row.baseLgd, LGD_STRESS: row.stressLgd, EAD_BASE: row.baseEad, EAD_STRESS: row.stressEad,
      ECL_BASE: row.baselineEcl, ECL_STRESS: row.stressedEcl, INCREMENTAL_ECL: row.incrementalEcl })) };
  return { config: c, context, nodes, facilities: rows, sectors, baseline: { ecl: baselineResult.weightedEcl, ead: baselineResult.ead },
    stressed: { ecl: stressedResult.weightedEcl, ead: stressedResult.ead }, reportingEcl, capital, liquidity, checks, contract, esg,
    summary: { baselineEcl: baselineResult.weightedEcl, stressedEcl: stressedResult.weightedEcl, reportingEcl: reportingEcl.weightedEcl,
      incrementalEcl: capital.creditLoss, capitalAfter: capital.capitalAfter, carAfter: capital.carAfter, lcrAfter: liquidity.lcrAfter,
      scopeCount: scoped.length, scopeEad: rows.filter(r => r.scopeMatch).reduce((total, r) => total + r.baseEad, 0), drawdown,
      financedEmissions: esg.summary.financedEmissions, checksPassed: checks.filter(c => c.status === 'PASS').length, checksTotal: checks.length } };
}
