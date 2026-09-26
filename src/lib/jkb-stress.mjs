import { calculateECL } from './risk.mjs';

// Source-derived mechanisms, with synthetic defaults. No private workbook data is bundled.
export const JKB_SEVERITIES = ['MODERATE', 'MEDIUM', 'SEVERE'];
const triple = (pct, amount = [0, 0, 0], customers = [1, 3, 5]) => Object.fromEntries(JKB_SEVERITIES.map((s, i) => [s, { pct: pct[i], amount: amount[i], numCustomers: customers[i] }]));
const creditFields = ['rwStage1', 'rwStage2', 'rwStage3', 'maxEclStage1', 'maxEclStage2'];
const liquidFields = ['hqla', 'outflows', 'inflows', 'asf', 'rsf', 'liquidAssets', 'liquidLiabilities', 'selectedHqla', 'selectedOutflows', 'selectedInflows', 'selectedAsf', 'selectedRsf', 'selectedLiquidAssets', 'selectedLiquidLiabilities'];
const caseOf = (id, name, family, kind, sourceSheet, description, fields, shocks, sourceRefs, shockUnit = 'fraction') => ({ id, name, family, kind, sourceSheet, description, fields, shocks, sourceRefs, shockUnit });
export const JKB_CASES = [
  caseOf('credit-npa-growth', 'Growth in existing NPA stock', 'Credit', 'Increase in NPA percentage of segment', 'CR_T001_E1', 'Increase NPA by a fraction of existing Stage 3 exposure, funded proportionally from performing stages.', creditFields, triple([.1, .25, .5]), ['CR_T001_E1!F56:F88', 'Config_ElementTypeRules!J573']),
  caseOf('credit-migration', 'Performing exposures migrate to NPA', 'Credit / climate / geopolitical', 'Specified portfolio segment moves from performing to NPA', 'CR_T003_E1', 'Move a selected share of Stage 1 and 2 exposures to Stage 3. Sector scope supports the climate and geopolitical case pattern.', creditFields, triple([.05, .1, .2]), ['Config_ElementTypeRules!J1718:J1719', 'Config_ElementTypeRules!J1744', 'Config_ElementTypeRules!J1768']),
  caseOf('credit-concentration', 'Largest borrower defaults', 'Concentration', 'Specific customers becomes NPA', 'CoR_T001_E1', 'Rank normalized borrower groups by EAD; default all facilities of selected borrowers, including cross-sector relationships.', creditFields, triple([1, 1, 1]), ['Config_ElementTypeRules!J1119:J1120', 'Config_ElementTypeRules!J1145']),
  caseOf('market-fx', 'Exchange rate translation', 'Market', 'Exchange rates changing', 'MR_T001_E1', 'Positive shock means local currency appreciation; negative means depreciation. Translate scoped credit exposure and long/short positions.', ['fxLong', 'fxShort', 'rwaFx'], triple([.05, .1, .2]), ['MR_T001_E1!F46:F54', 'Config_ElementTypeRules!J386', 'Config_ElementTypeRules!J414', 'Config_ElementTypeRules!J422']),
  caseOf('market-rates', 'Interest rate / repricing gap', 'Market / IRRBB', 'Interest rate change', 'MR_T003_E1', 'Apply a rate change to the RSA−RSL gap. This is the source earnings-gap sensitivity, not an EVE duration model.', ['rsa', 'rsl'], triple([.01, .02, .03]), ['Config_ElementTypeRules!J667', 'Config_ElementTypeRules!J712', 'Config_ElementTypeRules!J718'], 'bps'),
  caseOf('market-price', 'Bond or equity price movement', 'Market', 'Market Price Change of Bonds and Stocks', 'MR_T005_E1', 'A signed price return changes market value and profit. Credit and market RWA are not shocked a second time.', ['marketValue'], triple([-.05, -.15, -.3]), ['MR_T005_E1!F84', 'Config_ElementTypeRules!J1020']),
  caseOf('operational-loss', 'Specific operational loss', 'Operational', 'Specific loss', 'OR_T001_E1', 'Apply a signed pre-tax amount for fraud, conduct or other specific loss; a negative amount is a loss.', [], triple([0, 0, 0], [-2, -6, -12]), ['Config_ElementTypeRules!J1472', 'Config_ElementTypeRules!J1475'], 'amount'),
  caseOf('profit-change', 'Profit / business-line shock', 'Operational / geopolitical', 'Change in profits', 'GP_T001_E04', 'Apply a signed proportional change to pre-tax profit, plus any explicit amount adjustment.', ['pbt'], triple([-.1, -.25, -.5]), ['Config_ElementTypeRules!J268:J273']),
  caseOf('liquidity-runoff', 'Deposit segment withdrawal', 'Liquidity', 'Specified Percentage of Deposits are Withdrawn', 'LR_T001_E1', 'Reduce the selected pre-shock liquid assets, liabilities, HQLA, outflow and stable-funding contributions by the withdrawal share.', liquidFields, triple([.05, .1, .2]), ['Config_ElementTypeRules!J1643:J1665']),
  caseOf('liquidity-concentration', 'Largest depositors withdraw', 'Liquidity / concentration', 'Specific customers withdraw deposits', 'LR_T008_E1', 'Withdraw the selected largest depositors. Native workbook mode consumes its already selected customer aggregate.', ['depositBase', ...liquidFields], triple([1, 1, 1]), ['Config_ElementTypeRules!J1347', 'LR_T010_E1!F22:F49']),
  caseOf('liquidity-drawdown', 'Unused facility limits draw down', 'Liquidity / credit', 'Limit Drawdown', 'LR_T011_E1', 'Convert undrawn limits to funded exposure. Liquidity cash use and the incremental EAD after CCF reconcile separately.', ['undrawn', 'drawdownCcf', 'rsfWeight', ...liquidFields], triple([.1, .25, .5]), ['LR_T011_E1!F22:F48', 'Config_ElementTypeRules!J896']),
  caseOf('liquidity-assets', 'Liquid asset depletion', 'Liquidity', 'Change in Value of Liquid Assets', 'LR_T009_E1', 'Reduce the selected liquid assets, HQLA and inflow contribution. Liabilities and outflows remain unchanged, following the recovery corrections.', liquidFields, triple([.05, .1, .2]), ['Config_ElementTypeRules!J138', 'Config_ElementTypeRules!J143', 'Config_ElementTypeRules!J146']),
  caseOf('liquidity-deposit-change', 'Deposit change without asset change', 'Liquidity', 'Deposit increase or withdrawn without change in liquid assets', 'Config_ElementTypeRules', 'Apply a signed deposit-side change to liabilities, outflow and ASF/RSF contributions while liquid assets and HQLA remain fixed.', liquidFields, triple([-.05, -.1, -.2]), ['Config_ElementTypeRules!J1939:J1961']),
];

const input = (key, label, group, value, unit = 'amount', min = 0, max = Number.MAX_SAFE_INTEGER) => ({ key, label, group, value, unit, min, max });
export const JKB_INPUT_FIELDS = [
  ...[1, 2, 3].flatMap((s, i) => [input(`stage${s}Exposure`, `Stage ${s} gross exposure`, 'Native credit', [700, 200, 100][i]), input(`stage${s}Ecl`, `Stage ${s} base ECL`, 'Native credit', [7, 20, 50][i]), input(`stage${s}Iis`, `Stage ${s} interest in suspense`, 'Native credit', 0)]),
  input('maxEclStage1', 'Stage 1 maximum stress ECL (native)', 'Native credit', 350), input('maxEclStage2', 'Stage 2 maximum stress ECL (native)', 'Native credit', 100),
  input('rwStage1', 'Stage 1 RWA / gross ECL exposure', 'Credit weights', 1, 'fraction', 0, 5), input('rwStage2', 'Stage 2 RWA / net ECL exposure', 'Credit weights', 1, 'fraction', 0, 5), input('rwStage3', 'Stage 3 RWA / net ECL exposure', 'Credit weights', 1.5, 'fraction', 0, 5),
  input('cet1', 'Opening CET1 capital', 'Capital / earnings', 250), input('at1', 'Opening additional Tier 1', 'Capital / earnings', 10), input('t2', 'Opening Tier 2 capital', 'Capital / earnings', 40),
  input('rwaOtherCredit', 'Other credit RWA outside selected exposures', 'Capital / earnings', 350), input('rwaMarket', 'Total market RWA', 'Capital / earnings', 100), input('rwaFx', 'FX RWA component of market RWA', 'Capital / earnings', 40), input('rwaOperational', 'Operational RWA', 'Capital / earnings', 150),
  input('pbt', 'Baseline profit before tax', 'Capital / earnings', 70, 'amount', -Number.MAX_SAFE_INTEGER), input('taxRate', 'Tax rate; no tax credit on losses', 'Capital / earnings', .25, 'fraction', 0, 1), input('tier2AllowanceFactor', 'Stage 1 allowance inclusion in Tier 2', 'Capital / earnings', 1, 'fraction', 0, 1),
  input('fxLong', 'Scoped foreign currency long position', 'Market / rates', 180), input('fxShort', 'Scoped foreign currency short position', 'Market / rates', 120), input('rsa', 'Rate-sensitive assets', 'Market / rates', 800), input('rsl', 'Rate-sensitive liabilities', 'Market / rates', 1000), input('marketValue', 'Scoped bond / equity market value', 'Market / rates', 120),
  input('depositBase', 'Deposit population for concentration ranking', 'Funding / limits', 1000), input('undrawn', 'Native selected undrawn limits', 'Funding / limits', 150), input('drawdownCcf', 'Native pre-drawdown CCF', 'Funding / limits', .5, 'fraction', 0, 1), input('rsfWeight', 'RSF factor on new funded drawdown', 'Funding / limits', .85, 'fraction', 0, 1),
  input('hqla', 'Bank HQLA stock', 'Liquidity totals', 350), input('outflows', 'Bank gross liquidity outflows', 'Liquidity totals', 300), input('inflows', 'Bank gross liquidity inflows', 'Liquidity totals', 80), input('asf', 'Bank available stable funding', 'Liquidity totals', 1100), input('rsf', 'Bank required stable funding', 'Liquidity totals', 900), input('liquidAssets', 'Bank legal liquid assets', 'Liquidity totals', 500), input('liquidLiabilities', 'Bank legal liquid liabilities', 'Liquidity totals', 1000),
  input('selectedHqla', 'Selected HQLA contribution', 'Selected liquidity scope', 200), input('selectedOutflows', 'Selected outflow contribution', 'Selected liquidity scope', 120), input('selectedInflows', 'Selected inflow contribution', 'Selected liquidity scope', 40), input('selectedAsf', 'Selected ASF contribution', 'Selected liquidity scope', 600), input('selectedRsf', 'Selected RSF contribution', 'Selected liquidity scope', 100), input('selectedLiquidAssets', 'Selected legal liquid assets', 'Selected liquidity scope', 250), input('selectedLiquidLiabilities', 'Selected legal liquid liabilities', 'Selected liquidity scope', 700),
];
export const DEFAULT_JKB_CONFIG = {
  caseId: 'credit-migration', severity: 'MODERATE', basis: 'portfolio', sector: '', currency: 'USD', amountUnit: 'millions', source: null,
  inputs: Object.fromEntries(JKB_INPUT_FIELDS.map(f => [f.key, f.value])), overrides: {},
  depositors: [{ id: 'D1', name: 'Synthetic depositor A', balance: 180 }, { id: 'D2', name: 'Synthetic depositor B', balance: 130 }, { id: 'D3', name: 'Synthetic depositor C', balance: 90 }, { id: 'D4', name: 'Synthetic depositor D', balance: 60 }, { id: 'D5', name: 'Synthetic depositor E', balance: 40 }],
};
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min, max, label) => { if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be a number between ${min} and ${max}.`); };
const sum = values => values.reduce((a, b) => a + b, 0);
const ratio = (n, d) => d > 0 ? n / d : null;
const nameKey = name => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const difference = (a, b) => a === null || b === null ? null : a - b;

/** Required fields for the selected mechanism. Unknown unrelated native fields stay null. */
export function getJKBRequiredInputs(caseId, basis = 'workbook') {
  if (!JKB_CASES.some(c => c.id === caseId)) throw new Error('Choose a supported JKB mechanism.');
  const keys = ['rwStage1', 'rwStage2', 'rwStage3', 'cet1', 'at1', 't2', 'rwaOtherCredit', 'rwaMarket', 'rwaOperational', 'pbt', 'taxRate', 'hqla', 'outflows', 'inflows', 'asf', 'rsf', 'liquidAssets', 'liquidLiabilities'];
  if (basis === 'workbook') keys.push(...[1, 2, 3].flatMap(s => [`stage${s}Exposure`, `stage${s}Ecl`, `stage${s}Iis`]));
  if (['credit-migration', 'credit-npa-growth', 'credit-concentration'].includes(caseId)) { keys.push('tier2AllowanceFactor'); if (basis === 'workbook') keys.push('maxEclStage1', 'maxEclStage2'); }
  if (caseId === 'market-fx') keys.push('fxLong', 'fxShort', 'rwaFx', 'tier2AllowanceFactor');
  if (caseId === 'market-rates') keys.push('rsa', 'rsl');
  if (caseId === 'market-price') keys.push('marketValue');
  if (caseId === 'liquidity-runoff') keys.push('selectedLiquidAssets', 'selectedLiquidLiabilities', 'selectedHqla', 'selectedOutflows', 'selectedAsf', 'selectedRsf');
  if (caseId === 'liquidity-assets') keys.push('selectedLiquidAssets', 'selectedHqla', 'selectedInflows');
  if (caseId === 'liquidity-deposit-change') keys.push('selectedLiquidLiabilities', 'selectedOutflows', 'selectedAsf', 'selectedRsf');
  if (caseId === 'liquidity-concentration') { keys.push(...liquidFields.filter(k => k.startsWith('selected'))); if (basis === 'portfolio') keys.push('depositBase'); }
  if (caseId === 'liquidity-drawdown') { keys.push('rsfWeight', 'tier2AllowanceFactor'); if (basis === 'workbook') keys.push('undrawn', 'drawdownCcf'); }
  return [...new Set(keys)];
}
function requireNativeShock(c) {
  if (c.basis !== 'workbook' || !c.source?.caseKey) return;
  const shock = c.overrides?.[c.caseId]?.[c.severity];
  if (!record(shock) || ['pct', 'amount', 'numCustomers'].some(key => !Object.hasOwn(shock, key))) {
    const reason = c.source.unavailableSeverities?.find(s => s.severity === c.severity)?.reason;
    throw new Error(`No complete native shock for ${c.severity}. ${reason || 'Apply a matching native observation or explicitly supply all shock inputs.'}`);
  }
}

export function validateJKBConfig(value = {}) {
  if (!record(value)) throw new Error('JKB stress configuration must be a record.');
  for (const key of ['inputs', 'overrides']) if (value[key] !== undefined && !record(value[key])) throw new Error(`${key} must be a record.`);
  const native = value.basis === 'workbook';
  const c = { ...DEFAULT_JKB_CONFIG, ...value, inputs: native ? Object.fromEntries(JKB_INPUT_FIELDS.map(f => [f.key, value.inputs?.[f.key] ?? null])) : { ...DEFAULT_JKB_CONFIG.inputs, ...value.inputs }, overrides: { ...value.overrides } };
  if (!JKB_CASES.some(x => x.id === c.caseId)) throw new Error('Choose a supported JKB mechanism.');
  if (!JKB_SEVERITIES.includes(c.severity)) throw new Error('Choose MODERATE, MEDIUM or SEVERE.');
  if (!['portfolio', 'workbook'].includes(c.basis)) throw new Error('Basis must be portfolio or workbook.');
  if (typeof c.sector !== 'string') throw new Error('Sector scope must be text.');
  if (typeof c.currency !== 'string' || !/^[A-Z]{3}$/.test(c.currency)) throw new Error('Currency must be a three-letter code.');
  if (typeof c.amountUnit !== 'string' || !['units', 'thousands', 'millions'].includes(c.amountUnit)) throw new Error('Select units, thousands or millions.');
  if (c.basis === 'portfolio' && (c.currency !== 'USD' || c.amountUnit !== 'millions')) throw new Error('Shared portfolio calculations use USD millions; select native workbook basis for another currency or scale.');
  if (c.source !== null && !record(c.source)) throw new Error('Workbook source metadata must be a record.');
  if (c.source?.currency !== undefined && c.source.currency !== c.currency) throw new Error('Imported currency cannot be relabeled. Detach workbook provenance or import the correct currency; no conversion is performed.');
  if (c.source?.amountUnit !== undefined && c.source.amountUnit !== c.amountUnit) throw new Error('Imported amount scale cannot be relabeled. Detach workbook provenance or import the correct scale; no conversion is performed.');
  if (c.source?.caseKey !== undefined) {
    const keys = ['asOf', 'entity', 'scenarioId', 'elementId', 'severity'];
    if (keys.some(key => typeof c.source[key] !== 'string' || !c.source[key].trim()) || !JKB_SEVERITIES.includes(c.source.severity) || c.source.caseKey !== JSON.stringify(keys.map(key => c.source[key]))) throw new Error('Native workbook case identity does not match its reporting date, entity, scenario, element and severity.');
  }
  const required = new Set(getJKBRequiredInputs(c.caseId, c.basis));
  const missing = [...required].filter(key => c.inputs[key] === null || c.inputs[key] === undefined);
  if (missing.length) throw new Error(`Complete the required ${c.basis} input gaps: ${missing.join(', ')}.`);
  if (c.source) c.source = { ...c.source, missingInputs: [] };
  for (const f of JKB_INPUT_FIELDS) if (c.inputs[f.key] !== null && c.inputs[f.key] !== undefined) finite(c.inputs[f.key], f.min, f.max, f.label);
  for (const s of [1, 2, 3]) {
    if (c.inputs[`stage${s}Iis`] > c.inputs[`stage${s}Exposure`]) throw new Error(`Stage ${s} suspense cannot exceed gross exposure.`);
    if (c.inputs[`stage${s}Ecl`] > c.inputs[`stage${s}Exposure`] - c.inputs[`stage${s}Iis`]) throw new Error(`Stage ${s} ECL cannot exceed exposure less suspense.`);
  }
  if (required.has('rwaFx') && c.inputs.rwaFx > c.inputs.rwaMarket) throw new Error('FX RWA is a component of market RWA and cannot exceed it.');
  for (const [selected, total] of [['selectedHqla', 'hqla'], ['selectedOutflows', 'outflows'], ['selectedInflows', 'inflows'], ['selectedAsf', 'asf'], ['selectedRsf', 'rsf'], ['selectedLiquidAssets', 'liquidAssets'], ['selectedLiquidLiabilities', 'liquidLiabilities']]) if (required.has(selected) && c.inputs[selected] > c.inputs[total]) throw new Error(`${selected} cannot exceed the bank total ${total}.`);
  for (const [id, severities] of Object.entries(c.overrides)) {
    const test = JKB_CASES.find(x => x.id === id);
    if (!test || !record(severities)) throw new Error('Scenario overrides must use supported case IDs.');
    for (const [severity, shock] of Object.entries(severities)) {
      if (!JKB_SEVERITIES.includes(severity) || !record(shock)) throw new Error('Each override must identify a supported severity and shock record.');
      const merged = { ...test.shocks[severity], ...shock };
      finite(merged.pct, ['market-fx', 'market-rates', 'market-price', 'profit-change', 'liquidity-deposit-change'].includes(id) ? -1 : 0, id === 'credit-npa-growth' ? 100 : 1, 'Shock rate');
      finite(merged.amount, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'Signed shock amount');
      finite(merged.numCustomers, 1, 10000, 'Number of customers');
      if (!Number.isInteger(merged.numCustomers)) throw new Error('Number of customers must be a whole number.');
    }
  }
  if (!Array.isArray(c.depositors)) throw new Error('Deposit concentration records must be an array.');
  const ids = new Set();
  for (const d of c.depositors) {
    if (!record(d) || typeof d.id !== 'string' || !d.id.trim() || ids.has(d.id) || typeof d.name !== 'string' || !d.name.trim()) throw new Error('Each depositor needs a unique ID and name.');
    finite(d.balance, 0, Number.MAX_SAFE_INTEGER, 'Depositor balance'); ids.add(d.id);
  }
  if (c.caseId === 'liquidity-concentration' && c.basis === 'portfolio' && sum(c.depositors.map(d => d.balance)) > c.inputs.depositBase + 1e-8) throw new Error('Listed depositor balances cannot exceed the deposit population.');
  requireNativeShock(c);
  return c;
}

function creditBase(facilities, c, cube) {
  const i = c.inputs;
  if (c.basis === 'workbook') return [1, 2, 3].map(stage => ({ id: `native-stage-${stage}`, borrower: `Native selected Stage ${stage}`, sector: c.sector, stage, ead: i[`stage${stage}Exposure`] - i[`stage${stage}Iis`], gross: i[`stage${stage}Exposure`], iis: i[`stage${stage}Iis`], ecl: i[`stage${stage}Ecl`], defaultEcl: stage < 3 ? i[`maxEclStage${stage}`] : i.stage3Ecl, undrawn: stage === 1 ? i.undrawn : 0, ccf: i.drawdownCcf, scope: true }));
  if (!Array.isArray(facilities) || !facilities.length) throw new Error('Load a portfolio or use native workbook basis.');
  const base = calculateECL(facilities, [{ id: 'baseline', name: 'Baseline', weight: 1, pdMultiplier: 1 }]);
  const defaulted = calculateECL(facilities.map(f => ({ ...f, daysPastDue: 90 })), [{ id: 'default', name: 'Default', weight: 1, pdMultiplier: 1 }]);
  const cubeMap = new Map((cube?.facilities || []).map(f => [f.id, f]));
  if (cube && (cubeMap.size !== facilities.length || facilities.some(f => !cubeMap.has(f.id)))) throw new Error('Connected RiskCube result must cover the current portfolio exactly.');
  return base.facilities.map((f, index) => {
    const connected = cubeMap.get(f.id);
    if (connected && (Math.abs(connected.baseEad - f.ead) > 1e-8 || connected.stage !== f.stage || nameKey(connected.borrower) !== nameKey(f.borrower))) throw new Error(`${f.id}: connected RiskCube calibration is stale for the current portfolio.`);
    const periods = connected?.baselinePeriods ?? f.scenarios[0].periods;
    const lossPerEad = sum(periods.map(p => p.lgd * p.marginalPd * p.discountFactor));
    return { id: f.id, borrower: f.borrower, sector: f.sector, stage: f.stage, ead: f.ead, gross: f.ead, iis: 0, ecl: connected?.baselineEcl ?? f.weightedEcl, defaultEcl: defaulted.facilities[index].weightedEcl, lossPerEad, undrawn: f.undrawn, ccf: f.ccf, scope: !c.sector || f.sector === c.sector, lgd: f.lgd, rate: f.rate, years: f.years };
  });
}
function metrics(i, stages) {
  const ead = sum(stages.map(s => s.exposure)); const ecl = sum(stages.map(s => s.ecl));
  const rwaCredit = i.rwaOtherCredit + sum(stages.map(s => s.rwa));
  const rwa = rwaCredit + i.rwaMarket + i.rwaOperational;
  const totalCapital = i.cet1 + i.at1 + i.t2;
  const netOutflows = i.outflows - i.inflows;
  return { ead, ecl, cet1: i.cet1, at1: i.at1, t2: i.t2, totalCapital, rwaCredit, rwaMarket: i.rwaMarket, rwaOperational: i.rwaOperational, rwa,
    car: ratio(totalCapital, rwa), cet1Ratio: ratio(i.cet1, rwa), pbt: i.pbt, pat: i.pbt - Math.max(0, i.pbt) * i.taxRate,
    hqla: i.hqla, outflows: i.outflows, inflows: i.inflows, netOutflows, lcr: ratio(i.hqla, netOutflows), asf: i.asf, rsf: i.rsf, nsfr: ratio(i.asf, i.rsf), liquidAssets: i.liquidAssets, liquidLiabilities: i.liquidLiabilities, legalLiquidity: ratio(i.liquidAssets, i.liquidLiabilities) };
}
const stageSummary = (rows, i) => [1, 2, 3].map(stage => {
  const selected = rows.filter(r => r.stage === stage); const exposure = sum(selected.map(r => r.ead)); const ecl = sum(selected.map(r => r.ecl));
  return { stage, exposure, ecl, rwa: Math.max(0, exposure - (stage === 1 ? 0 : ecl)) * i[`rwStage${stage}`] };
});
const check = (id, label, expected, actual) => { const delta = actual - expected; return { id, label, expected, actual, difference: delta, status: Math.abs(delta) <= 1e-8 * Math.max(1, Math.abs(expected)) ? 'PASS' : 'FAIL' }; };

function evaluate(facilities, c, cube) {
  requireNativeShock(c);
  const selectedCase = JKB_CASES.find(x => x.id === c.caseId); const shock = { ...selectedCase.shocks[c.severity], ...c.overrides[c.caseId]?.[c.severity] };
  const i = c.inputs; const rows = creditBase(facilities, c, cube); const beforeStages = stageSummary(rows, i); const baseline = metrics(i, beforeStages); const next = { ...i }; const warnings = [];
  if (c.basis === 'portfolio' && c.sector && !rows.some(r => r.scope) && ['credit-npa-growth', 'credit-migration', 'credit-concentration', 'market-fx', 'liquidity-drawdown'].includes(c.caseId)) throw new Error('No portfolio facilities match the selected sector scope.');
  const borrowers = new Map();
  for (const r of rows) {
    const key = nameKey(r.borrower); const g = borrowers.get(key) || { id: key, borrower: r.borrower, name: r.borrower, exposure: 0, eligible: false, count: 0 };
    g.exposure += r.ead; g.eligible ||= r.scope && r.stage < 3; g.count++; borrowers.set(key, g);
  }
  let concentration = [...borrowers.values()].sort((a, b) => b.exposure - a.exposure || a.id.localeCompare(b.id)).map((g, index) => ({ ...g, rank: index + 1, selected: false }));
  const chosenBorrowers = new Set(concentration.filter(g => g.eligible).slice(0, shock.numCustomers).map(g => g.id));
  const performing = rows.filter(r => r.scope && r.stage < 3); const performingEad = sum(performing.map(r => r.ead));
  const existingNpa = sum(rows.filter(r => r.scope && r.stage === 3).map(r => r.ead));
  let migrationShare = 0; let cashDrawdown = 0; let eadDrawdown = 0; let externalPbt = 0; let translatedEad = 0; let withdrawal = 0;
  if (c.caseId === 'credit-migration') migrationShare = shock.pct;
  if (c.caseId === 'credit-npa-growth') {
    const requested = existingNpa * shock.pct;
    migrationShare = performingEad > 0 ? Math.min(1, requested / performingEad) : 0;
    if (requested > performingEad + 1e-8) warnings.push('Requested NPA growth exceeds performing exposure; transfer is capped at available performing exposure.');
  }
  const afterRows = [];
  for (const row of rows) {
    let share = row.stage < 3 && row.scope ? migrationShare : 0;
    if (c.caseId === 'credit-concentration' && row.stage < 3) share = c.basis === 'workbook' ? 1 : (chosenBorrowers.has(nameKey(row.borrower)) ? 1 : 0);
    if (c.caseId === 'credit-concentration') concentration = concentration.map(g => ({ ...g, selected: chosenBorrowers.has(g.id) }));
    if (share > 0) {
      // The source maximum-stress-ECL ratio maps the transferred performing slice to Stage 3.
      const defaultEcl = Math.max(row.ecl, Math.min(row.ead, row.defaultEcl));
      afterRows.push({ ...row, ead: row.ead * (1 - share), ecl: row.ecl * (1 - share) });
      afterRows.push({ ...row, id: `${row.id}:migration`, stage: 3, ead: row.ead * share, ecl: defaultEcl * share });
    } else {
      let ead = row.ead; let ecl = row.ecl;
      if (c.caseId === 'market-fx' && row.scope) { ead *= 1 - shock.pct; ecl *= 1 - shock.pct; translatedEad += ead - row.ead; }
      if (c.caseId === 'liquidity-drawdown' && row.scope) {
        const drawn = row.undrawn * shock.pct; const extraEad = drawn * (1 - row.ccf); cashDrawdown += drawn; eadDrawdown += extraEad; ead += extraEad;
        // Reuse the calibrated facility loss ratio. Zero-EAD facilities use the shared engine.
        if (row.ead > 0) ecl += extraEad * row.ecl / row.ead;
        else if (extraEad > 0 && c.basis === 'portfolio') ecl = extraEad * row.lossPerEad;
        else if (extraEad > 0) throw new Error('Native drawdown has no base exposure/loss ratio. Supply a non-zero exposure calibration.');
      }
      afterRows.push({ ...row, ead, ecl });
    }
  }
  if (c.caseId === 'market-fx') { externalPbt = -(i.fxLong - i.fxShort) * shock.pct; next.rwaMarket += i.rwaFx * Math.abs(shock.pct); }
  if (c.caseId === 'market-rates') { externalPbt = (i.rsa - i.rsl) * shock.pct; next.rwaOperational = Math.max(0, i.rwaOperational + externalPbt / 3 * .15 * 12.5); }
  if (c.caseId === 'market-price') externalPbt = i.marketValue * shock.pct;
  if (c.caseId === 'operational-loss') externalPbt = shock.amount;
  if (c.caseId === 'profit-change') externalPbt = i.pbt * shock.pct + shock.amount;
  const adjustLiquidity = (fraction, keys) => { for (const key of keys) { const selected = `selected${key[0].toUpperCase()}${key.slice(1)}`; next[key] += i[selected] * fraction; } };
  if (c.caseId === 'liquidity-runoff') { adjustLiquidity(-shock.pct, ['liquidAssets', 'liquidLiabilities', 'hqla', 'outflows', 'asf', 'rsf']); withdrawal = i.selectedLiquidLiabilities * shock.pct; }
  if (c.caseId === 'liquidity-assets') adjustLiquidity(-shock.pct, ['liquidAssets', 'hqla', 'inflows']);
  if (c.caseId === 'liquidity-deposit-change') adjustLiquidity(shock.pct, ['liquidLiabilities', 'outflows', 'asf', 'rsf']);
  if (c.caseId === 'liquidity-concentration') {
    let share = 1;
    if (c.basis === 'portfolio') {
      if (c.depositors.length < shock.numCustomers) throw new Error(`Supply at least ${shock.numCustomers} depositor records to run this concentration severity.`);
      if (i.depositBase <= 0) throw new Error('A positive deposit population is required for concentration.');
      concentration = [...c.depositors].sort((a, b) => b.balance - a.balance || a.id.localeCompare(b.id)).map((d, index) => ({ id: d.id, name: d.name, borrower: d.name, exposure: d.balance, count: 1, rank: index + 1, selected: index < shock.numCustomers }));
      withdrawal = sum(concentration.filter(d => d.selected).map(d => d.exposure)); share = withdrawal / i.depositBase;
      warnings.push('Depositor contribution factors are applied proportionally to the configured deposit population; no customer ALM contributions are inferred.');
    } else { withdrawal = i.selectedLiquidLiabilities; warnings.push('Native inputs already represent the workbook customer selection; changing the customer count requires a new matching source selection.'); }
    adjustLiquidity(-share, ['liquidAssets', 'liquidLiabilities', 'hqla', 'outflows', 'inflows', 'asf', 'rsf']);
  }
  if (c.caseId === 'liquidity-drawdown') {
    // Explicit extension of the workbook's liquidity-only drawdown: retain facility CCF credit linkage.
    next.hqla = Math.max(0, i.hqla - cashDrawdown); next.liquidAssets = Math.max(0, i.liquidAssets - cashDrawdown); next.rsf += cashDrawdown * i.rsfWeight;
    if (cashDrawdown > i.hqla) warnings.push(`Cash drawdown exceeds HQLA by ${cashDrawdown - i.hqla}; HQLA is exhausted and additional funding is required.`);
  }
  const afterStages = stageSummary(afterRows, i); const creditDelta = sum(afterStages.map(s => s.ecl)) - baseline.ecl;
  next.pbt = i.pbt - creditDelta + externalPbt;
  const pat = next.pbt - Math.max(0, next.pbt) * i.taxRate; next.cet1 = i.cet1 + pat - baseline.pat;
  const stage1Delta = afterStages[0].ecl - beforeStages[0].ecl;
  next.t2 = i.t2 + (stage1Delta === 0 ? 0 : stage1Delta * i.tier2AllowanceFactor);
  const stressed = metrics(next, afterStages); const impact = Object.fromEntries(Object.keys(baseline).map(k => [k, difference(stressed[k], baseline[k])]));
  const stages = beforeStages.map((s, index) => ({ stage: s.stage, exposureBefore: s.exposure, exposureAfter: afterStages[index].exposure, eclBefore: s.ecl, eclAfter: afterStages[index].ecl, rwaBefore: s.rwa, rwaAfter: afterStages[index].rwa }));
  for (const [key, label] of [['car', 'capital ratio'], ['lcr', 'LCR'], ['nsfr', 'NSFR'], ['legalLiquidity', 'legal liquidity ratio']]) if (stressed[key] === null) warnings.push(`${label} unavailable: its denominator is zero or negative.`);
  if (c.caseId === 'credit-concentration' && c.basis === 'workbook') warnings.push('Native credit inputs are the selected borrower aggregate; borrower contagion/ranking requires the shared portfolio or a newly selected workbook output.');
  if (c.caseId === 'profit-change') warnings.push('The source consumes externally calculated profit outputs. This web calculation explicitly uses baseline profit × signed change plus amount.');
  if (c.caseId === 'market-price') warnings.push('Only the independently evidenced market-value P&L impact is applied; ambiguous generated RWA cross-references are not reproduced.');
  if (c.caseId === 'market-fx' && c.basis === 'portfolio') warnings.push('The portfolio stores normalized USD amounts, not original currency denomination. The selected portfolio scope is an explicit FX-sensitive assumption; use native scoped workbook inputs for actual currency exposure.');
  if (c.caseId === 'market-rates') warnings.push('Source uses an earnings repricing gap and legacy ΔNII/3 × 15% × 12.5 operational-RWA sensitivity; no EVE or dynamic balance-sheet claim.');
  if (c.caseId === 'liquidity-drawdown') warnings.push('Facility CCF / ECL and RSF linkage is an explicit web extension. Cash is paid from HQLA immediately, so it is not also counted as a future outflow.');
  warnings.push('LCR is the source uncapped HQLA/(outflows−inflows) sensitivity, not a regulatory LCR implementation. Tax losses generate no assumed tax credit. Tier 2 allowance changes have no prudential eligibility/cap calculation.');
  const checks = [
    check('credit-exposure', 'Exposure movement reconciles', baseline.ead + eadDrawdown + translatedEad, stressed.ead),
    check('credit-loss', 'Stage ECL reconciles to total', stressed.ecl, sum(stages.map(s => s.eclAfter))),
    check('pbt', 'Credit charged once in profit bridge', baseline.pbt - creditDelta + externalPbt, stressed.pbt),
    check('cet1', 'After-tax profit delta reconciles to CET1', baseline.cet1 + stressed.pat - baseline.pat, stressed.cet1),
    check('capital', 'Capital components reconcile', stressed.cet1 + stressed.at1 + stressed.t2, stressed.totalCapital),
    check('rwa', 'RWA components reconcile', stressed.rwaCredit + stressed.rwaMarket + stressed.rwaOperational, stressed.rwa),
    check('liquidity', 'Gross liquidity flows reconcile', stressed.outflows - stressed.inflows, stressed.netOutflows),
  ];
  const definitions = {
    ead: ['ECL exposure', 'Stage exposures after transfer / translation / CCF', 'Config_ElementTypeRules!J1733'], ecl: ['Expected credit loss', 'Sum(stage loss); transfer uses performing release plus default loss', 'Config_ElementTypeRules!J1744'],
    pbt: ['Profit before tax', 'Baseline PBT − incremental ECL + other signed P&L impact', 'Config_ElementTypeRules!J1768'], pat: ['Profit after tax', 'PBT − max(PBT,0) × tax rate', 'Config_ElementTypeRules!J1770'], cet1: ['CET1 capital', 'Baseline CET1 + change in PAT', 'CR_T001_E1!F105'], at1: ['Additional Tier 1', 'Baseline AT1 held fixed', 'CR_T001_E1!F106'], t2: ['Tier 2 capital', 'Baseline T2 + ΔStage1 ECL × allowance inclusion factor', 'Config_ElementTypeRules!J1777'], totalCapital: ['Total capital', 'CET1 + AT1 + T2', 'CR_T001_E1!F108'],
    rwaCredit: ['Credit RWA', 'Other credit RWA + Stage1 gross × RW1 + Stage2/3 net of ECL × respective RW', 'CR_T001_E1!F85:F92'], rwaMarket: ['Market RWA', 'Baseline market RWA + FX RWA × absolute FX shock', 'Config_ElementTypeRules!J414'], rwaOperational: ['Operational RWA', 'Baseline operational RWA + IR gap earnings effect /3 × .15 ×12.5', 'Config_ElementTypeRules!J712'], rwa: ['Total RWA', 'Credit RWA + market RWA + operational RWA', 'CR_T001_E1!F97'], car: ['Capital adequacy ratio', 'Total capital / total RWA', 'CR_T001_E1!F109'], cet1Ratio: ['CET1 ratio', 'CET1 / total RWA', 'CR_T001_E1!F110'],
    hqla: ['HQLA', 'Baseline + selected contribution × signed shock (drawdown: immediate cash use)', 'Config_ElementTypeRules!J1650'], outflows: ['Liquidity outflows', 'Baseline + selected outflow contribution × signed shock', 'Config_ElementTypeRules!J1653'], inflows: ['Liquidity inflows', 'Baseline + applicable selected inflow shock', 'Config_ElementTypeRules!J1656'], netOutflows: ['Net liquidity outflows', 'Gross outflows − inflows', 'Config_ElementTypeRules!J1954'], lcr: ['Liquidity coverage sensitivity', 'HQLA / (outflows − inflows); no regulatory inflow cap', 'LR_T001_E1!F36'], asf: ['Available stable funding', 'Baseline ASF + selected ASF contribution × signed shock', 'Config_ElementTypeRules!J1662'], rsf: ['Required stable funding', 'Baseline RSF + selected RSF delta (drawdown: new funding × RSF factor)', 'Config_ElementTypeRules!J1665'], nsfr: ['Stable funding sensitivity', 'ASF / RSF', 'LR_T001_E1!F42'], liquidAssets: ['Legal liquid assets', 'Baseline + selected asset shock', 'Config_ElementTypeRules!J1643'], liquidLiabilities: ['Legal liquid liabilities', 'Baseline + selected liability shock', 'Config_ElementTypeRules!J1646'], legalLiquidity: ['Legal liquidity sensitivity', 'Liquid assets / liquid liabilities', 'LR_T001_E1!F27'],
  };
  const trace = Object.entries(definitions).map(([id, [label, formula, sourceRef]]) => ({ id, label, preShock: baseline[id], shock: impact[id], postShock: stressed[id], delta: impact[id], unit: ['car', 'cet1Ratio', 'lcr', 'nsfr', 'legalLiquidity'].includes(id) ? 'fraction' : 'amount', formula, sourceRef }));
  const summary = { baselineEcl: baseline.ecl, stressedEcl: stressed.ecl, incrementalEcl: creditDelta, capitalBefore: baseline.totalCapital, capitalAfter: stressed.totalCapital, carBefore: baseline.car, carAfter: stressed.car, cet1After: stressed.cet1, rwaAfter: stressed.rwa, lcrAfter: stressed.lcr, nsfrAfter: stressed.nsfr, pbtAfter: stressed.pbt, profitImpact: impact.pbt, drawdown: cashDrawdown, withdrawal, checksPassed: checks.filter(k => k.status === 'PASS').length, checksTotal: checks.length };
  return { schema: 'AVATI_JKB_STRESS_V1', config: c, case: selectedCase, shock, basis: c.basis, units: { currency: c.currency, amountUnit: c.amountUnit }, baseline, stressed, impact, stages, rows: trace, checks, concentration, warnings, summary, creditSource: c.basis === 'workbook' ? 'Native selected aggregate' : cube ? 'Connected RiskCube deterministic baseline' : 'Shared facility ECL engine', creditTrace: afterRows.map(r => ({ id: r.id, borrower: r.borrower, stage: r.stage, ead: r.ead, ecl: r.ecl })), methodology: 'Independent same-date sensitivities. Generated output is not independently verified against bank system results.' };
}

/** @param {any[]} facilities @param {any} config @param {any} cubeResult */
export function runJKBStress(facilities, config = {}, cubeResult = null) {
  const c = validateJKBConfig(config); const result = evaluate(facilities, c, cubeResult);
  result.comparison = JKB_SEVERITIES.map(severity => {
    try { const run = severity === c.severity ? result : evaluate(facilities, { ...c, severity }, cubeResult); return { severity, summary: run.summary, error: null }; }
    catch (error) { return { severity, summary: null, error: error.message }; }
  });
  return result;
}

export function createPublicJKBExample() { return JSON.parse(JSON.stringify(DEFAULT_JKB_CONFIG)); }
