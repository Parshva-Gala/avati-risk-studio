import { COLUMNS, validatePortfolio } from './portfolio.mjs';
import { validateESGConfig } from './esg.mjs';
import { calculateStress, validateScenarioWeights } from './risk.mjs';
import { buildRiskCubeProjection, validateRiskCubeProjectionInput } from './riskcube-adapter.mjs';
import { validateCubeConfig } from './cube.mjs';
import { validateJKBConfig, JKB_CASES, JKB_SEVERITIES } from './jkb-stress.mjs';
import { validateJKBWorkbookData } from './jkb-workbook.mjs';

export const MAX_WORKSPACE_BYTES = 15_000_000;
const banks = new Set(['midbank', 'jkb', 'nbi', 'jcb']);
const modules = new Set(['ESG', 'Stress', 'ECL', 'Pivot', 'RiskCube']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
const version = value => Number.isSafeInteger(value) && value >= 1;
const timestamp = value => typeof value === 'string' && value.length <= 30 && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = message => { throw new Error(message); };

// Accept portable JSON values only. This is structural validation, not authentication.
function jsonValues(value, depth = 0, seen = new Set()) {
  if (depth > 60) fail('Workspace nesting exceeds the supported depth.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) fail('Workspace numbers must be finite.'); return; }
  if (typeof value !== 'object') fail('Workspace must contain JSON values only.');
  if (seen.has(value)) fail('Workspace contains a circular reference.');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('Workspace contains an unsupported object.');
  seen.add(value);
  for (const child of Object.values(value)) jsonValues(child, depth + 1, seen);
  seen.delete(value);
}

function checkedPortfolio(input, label) {
  const result = validatePortfolio(input);
  if (result.errors.length) fail(`${label}: ${result.errors[0]}`);
  return result.rows;
}

export function validateSavedSettings(settings, facilities) {
  if (!object(settings)) fail('Workspace settings must be an object.');
  if (settings.esg !== undefined) {
    const problems = validateESGConfig(settings.esg);
    if (problems.length) fail(problems[0]);
  }
  if (settings.eclScenarios !== undefined) {
    const error = validateScenarioWeights(settings.eclScenarios);
    if (error) fail(`ECL settings: ${error}`);
    if (settings.eclScenarios.length > 20 || settings.eclScenarios.some(s => !text(s.name, 160) || !text(s.id, 120))) fail('ECL scenarios require text names and IDs, with at most 20 scenarios.');
  }
  if (settings.stressConfig !== undefined) {
    // The risk engine validates every supported parameter. One validated facility
    // is sufficient here; the saved portfolio is checked independently in full.
    try { calculateStress([facilities[0]], settings.stressConfig); }
    catch (error) { fail(`Stress settings: ${error.message}`); }
  }
  if (settings.stressPreset !== undefined && !['baseline', 'adverse', 'severe', 'custom'].includes(settings.stressPreset)) fail('Stress preset is not supported.');
  if (settings.jkbStressConfig !== undefined) {
    try { validateJKBConfig(settings.jkbStressConfig); }
    catch (error) { fail(`JKB stress settings: ${error.message}`); }
  }
  if (settings.jkbWorkbook !== undefined && settings.jkbWorkbook !== null) {
    try {
      const checked = validateJKBWorkbookData(settings.jkbWorkbook);
      if (!same(checked, settings.jkbWorkbook)) fail('The JKB workbook backup contains unsupported fields.');
    } catch (error) { fail(`JKB workbook: ${error.message}`); }
  }
  if (settings.cubeProjection !== undefined && settings.cubeProjection !== null) {
    if (!object(settings.cubeProjection)) fail('RiskCube projection must contain rows and selection.');
    const errors = validateRiskCubeProjectionInput(settings.cubeProjection.rows, settings.cubeProjection.selection);
    if (errors.length) fail(`RiskCube projection: ${errors[0]}`);
  }
  if (settings.cubeConfig !== undefined) {
    try { validateCubeConfig(settings.cubeConfig); }
    catch (error) { fail(`RiskCube settings: ${error.message}`); }
    if (settings.cubeConfig.pdOverrides != null || settings.cubeConfig.pdProvenance != null) fail('Save imported RiskCube PD data through cubeProjection rather than hidden manual overrides.');
  }
  return settings;
}

const portfolioSignature = rows => JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)).map(row => COLUMNS.map(key => row[key])));
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const finiteOrNull = value => value === null || typeof value === 'number' && Number.isFinite(value);
const near = (left, right) => left === null || right === null ? left === right : typeof left === 'number' && typeof right === 'number' && Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
const JKB_METRICS = ['ead','ecl','cet1','at1','t2','totalCapital','rwaCredit','rwaMarket','rwaOperational','rwa','car','cet1Ratio','pbt','pat','hqla','outflows','inflows','netOutflows','lcr','asf','rsf','nsfr','liquidAssets','liquidLiabilities','legalLiquidity'];
const JKB_RATIOS = new Set(['car','cet1Ratio','lcr','nsfr','legalLiquidity']);
const jkbCategory = id => ['ead','ecl'].includes(id) ? 'Credit' : ['pbt','pat'].includes(id) ? 'Earnings' : id.startsWith('rwa') ? 'RWA' : ['cet1','at1','t2','totalCapital','car','cet1Ratio'].includes(id) ? 'Capital' : 'Liquidity';

function validateJKBSnapshot(analysis, settings) {
  if (!object(analysis) || analysis.schema !== 'AVATI_JKB_STRESS_V1' || !object(analysis.config)) fail('JKB snapshot is missing its supported schema and configuration.');
  let config;
  try { config = validateJKBConfig(analysis.config); }
  catch (error) { fail(`JKB snapshot configuration: ${error.message}`); }
  const definition = JKB_CASES.find(item => item.id === config.caseId);
  if (!same(analysis.case, definition) || analysis.basis !== config.basis || !same(analysis.units, {currency:config.currency,amountUnit:config.amountUnit})) fail('JKB snapshot case, currency, scale or basis conflicts with its configuration.');
  if(!same(analysis.shock,{...definition.shocks[config.severity],...config.overrides[config.caseId]?.[config.severity]}))fail('JKB snapshot shock conflicts with its selected severity and overrides.');
  const source = config.source;
  if (source?.currency !== undefined && source.currency !== config.currency || source?.amountUnit !== undefined && source.amountUnit !== config.amountUnit) fail('JKB snapshot cannot relabel native source currency or amount scale.');
  if (source?.caseKey !== undefined) {
    const pack = settings.jkbWorkbook;
    const selected = pack?.cases?.find(item => item.key === source.caseKey);
    if (!selected || pack.source.filename !== source.filename || pack.source.currency !== config.currency || pack.source.amountUnit !== config.amountUnit || selected.elementType.toLowerCase() !== definition.kind.toLowerCase() || selected.asOf !== source.asOf || selected.entity !== source.entity || selected.scenarioId !== source.scenarioId || selected.elementId !== source.elementId || selected.row !== source.row || source.sourceSheet !== pack.source.sourceSheet) fail('JKB snapshot native provenance does not match its retained workbook selection.');
  }
  for (const field of ['baseline','stressed','impact']) if (!object(analysis[field]) || !same(Object.keys(analysis[field]).sort(), [...JKB_METRICS].sort()) || Object.values(analysis[field]).some(value => !finiteOrNull(value))) fail('JKB snapshot financial metrics are missing or invalid.');
  if (!Array.isArray(analysis.rows) || analysis.rows.length !== JKB_METRICS.length) fail('JKB snapshot requires one trace for every metric.');
  const seen = new Set();
  for (const row of analysis.rows) {
    if (!object(row) || !JKB_METRICS.includes(row.id) || seen.has(row.id) || !text(row.label,300) || !text(row.formula,2000) || !text(row.sourceRef,1000) || row.unit !== (JKB_RATIOS.has(row.id)?'fraction':'amount')) fail('JKB snapshot metric identity, formula or unit is invalid.');
    seen.add(row.id);
    const base = analysis.baseline[row.id], post = analysis.stressed[row.id], delta = base === null || post === null ? null : post - base;
    if (!near(row.preShock,base) || !near(row.postShock,post) || !near(row.delta,delta) || !near(row.shock,delta) || !near(analysis.impact[row.id],delta)) fail('JKB snapshot metric traces conflict with the pre/post-shock result.');
  }
  if (!Array.isArray(analysis.stages) || analysis.stages.length !== 3 || analysis.stages.some((row,index)=>!object(row)||row.stage!==index+1||['exposureBefore','exposureAfter','eclBefore','eclAfter','rwaBefore','rwaAfter'].some(key=>typeof row[key]!=='number'||row[key]<0))) fail('JKB snapshot stage transmission is invalid.');
  if (!Array.isArray(analysis.checks) || !analysis.checks.length || analysis.checks.length>100) fail('JKB snapshot reconciliation checks are missing.');
  const checkIds = new Set();
  for (const check of analysis.checks) {
    if (!object(check)||!text(check.id,120)||checkIds.has(check.id)||!text(check.label,500)||!['PASS','FAIL','BLOCKED'].includes(check.status)||!finiteOrNull(check.expected)||!finiteOrNull(check.actual)||!finiteOrNull(check.difference)) fail('JKB snapshot reconciliation check is invalid.');
    checkIds.add(check.id);
    if (check.expected === null || check.actual === null) { if(check.status!=='BLOCKED'||check.difference!==null)fail('Unavailable JKB checks must remain BLOCKED.'); }
    else if(!near(check.difference,check.actual-check.expected)||check.status!==(Math.abs(check.actual-check.expected)<=1e-8*Math.max(1,Math.abs(check.expected))?'PASS':'FAIL'))fail('JKB snapshot control difference or status is inconsistent.');
  }
  if (!object(analysis.summary) || Object.values(analysis.summary).some(value=>!finiteOrNull(value))) fail('JKB snapshot summary must retain numeric values or unavailable nulls.');
  if(analysis.summary.checksTotal!==analysis.checks.length||analysis.summary.checksPassed!==analysis.checks.filter(check=>check.status==='PASS').length)fail('JKB snapshot summary control counts are inconsistent.');
  for(const [key,section,field] of [['baselineEcl','baseline','ecl'],['stressedEcl','stressed','ecl'],['incrementalEcl','impact','ecl'],['capitalBefore','baseline','totalCapital'],['capitalAfter','stressed','totalCapital'],['carBefore','baseline','car'],['carAfter','stressed','car'],['lcrAfter','stressed','lcr'],['nsfrAfter','stressed','nsfr']]) if(!near(analysis.summary[key],analysis[section][field]))fail('JKB snapshot summary conflicts with its financial result.');
  if(!Array.isArray(analysis.comparison)||analysis.comparison.length!==JKB_SEVERITIES.length||analysis.comparison.some((item,index)=>!object(item)||item.severity!==JKB_SEVERITIES[index]||(item.error===null?(!object(item.summary)||Object.values(item.summary).some(value=>!finiteOrNull(value))):(!text(item.error,2000)||item.summary!==null))))fail('JKB severity comparison is invalid.');
  if(!same(analysis.comparison.find(item=>item.severity===config.severity).summary,analysis.summary))fail('JKB selected severity conflicts with its comparison result.');
}

// These checks establish self-consistent local provenance, not source authenticity.
function validateCubeSnapshot(analysis, portfolio, settings) {
  if (!object(analysis.config)) fail('RiskCube analysis is missing its connected calculation configuration.');
  let config;
  try { config = validateCubeConfig(analysis.config); }
  catch (error) { fail(`RiskCube analysis: ${error.message}`); }
  const imported = config.pdOverrides != null;
  const source = settings.cubeProjection;
  if (imported) {
    if (!object(source)) fail('RiskCube snapshot needs its raw projection export and selection.');
    const projection = buildRiskCubeProjection(portfolio, source.rows, source.selection);
    if (!projection.valid || !same(config.pdOverrides, projection.facilityCurves) || !same(config.pdProvenance, projection.provenance)) fail('RiskCube snapshot curves and provenance must match its complete source projection.');
  } else if (source != null || config.pdProvenance != null) fail('RiskCube snapshot source and active calibration disagree.');
  const inScope = facility => (!config.sector || config.sector === facility.sector) && (!config.country || config.country === facility.country);
  if (!portfolio.some(inScope)) fail('RiskCube snapshot scope contains no facilities.');
  const expectedContext = {
    runId: config.runId, scenarioId: config.scenarioId, segmentId: config.segmentId, asOf: config.asOf,
    sector: config.sector || 'All sectors', country: config.country || 'All countries', modelVersion: 'avati-connected-risk-1.0',
    pdSource: imported ? 'RiskCube exported PD curve' : 'Facility master annual PD', pdProvenance: config.pdProvenance, liveBackendConnected: false,
  };
  const contract = analysis.contract;
  if (!same(analysis.context, expectedContext) || !object(contract) || !same(contract.context, expectedContext)) fail('RiskCube snapshot run context and provenance are inconsistent.');
  if (contract.schema !== 'AVATI_CONNECTED_RISK_OUTPUT_V1' || contract.mode !== (imported ? 'validated-export-input' : 'local-input') || contract.liveBackendConnected !== false) fail('RiskCube snapshot must identify its supported local output contract.');
  if (!Array.isArray(contract.rows) || contract.rows.length !== portfolio.length) fail('RiskCube snapshot output must contain every facility exactly once.');
  const byId = new Map(portfolio.map(facility => [facility.id, facility]));
  const seen = new Set();
  for (const row of contract.rows) {
    const facility = object(row) && byId.get(row.FACILITY_ID);
    if (!facility || seen.has(row.FACILITY_ID)) fail('RiskCube snapshot output facility IDs are missing or duplicated.');
    seen.add(row.FACILITY_ID);
    if (row.RUN_ID !== config.runId || row.AS_OF_DATE !== config.asOf || row.SCENARIO_ID !== config.scenarioId || row.SEGMENT_SCOPE_ID !== config.segmentId || row.SCOPE_MATCH !== inScope(facility)) fail('RiskCube snapshot output rows conflict with their run context or scope.');
    const curve = imported ? config.pdOverrides.find(item => item.facilityId === facility.id) : null;
    if (row.IFRS_SEGMENT_ID !== (curve?.segmentId ?? null) || row.COUNTRY_ID !== (curve?.countryId ?? null) || row.PD_COUNTRY_SCOPE !== (curve ? curve.countryId === null ? 'global' : 'country-specific' : 'local-unmapped')) fail('RiskCube snapshot output rows conflict with source segment and country mapping.');
  }
}

/** Validates the portable local working-paper format without asserting authenticity. */
export function validateWorkspaceData(raw) {
  if (!object(raw)) fail('Invalid workspace.');
  jsonValues(raw);
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_WORKSPACE_BYTES) fail('Choose a workspace backup under 15 MB.');
  if (raw.schemaVersion !== 1 || !banks.has(raw.bank) || !version(raw.portfolioVersion)) fail('Unsupported workspace format.');
  const facilities = checkedPortfolio(raw.facilities, 'Portfolio');
  if (!Array.isArray(raw.runs) || !Array.isArray(raw.events) || raw.events.length > 500) fail('Invalid workspace history.');
  validateSavedSettings(raw.settings, facilities);
  const runIds = new Set(), eventIds = new Set(), runs = [];
  const portfoliosByVersion = new Map([[raw.portfolioVersion, portfolioSignature(facilities)]]);
  for (const run of raw.runs) {
    if (!object(run) || !text(run.id, 120) || run.id.trim() !== run.id || runIds.has(run.id)) fail('Saved analyses require unique, nonempty IDs.');
    runIds.add(run.id);
    if (!text(run.name, 300) || !timestamp(run.date) || !modules.has(run.module) || !banks.has(run.bank) || !version(run.portfolioVersion) || run.portfolioVersion > raw.portfolioVersion) fail('Invalid saved analysis metadata.');
    if (!object(run.summary) || Object.keys(run.summary).length === 0 || Object.keys(run.summary).length > 100 || Object.entries(run.summary).some(([key, value]) => !text(key, 160) || (typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && value.length > 4000))) fail('Invalid saved analysis summary.');
    const payload = run.payload;
    if (!object(payload) || payload.modelVersion !== 'avati-1.0' || !object(payload.analysis)) fail('Saved analysis is missing supported model metadata and complete inputs.');
    const portfolio = checkedPortfolio(payload.portfolio, 'Saved analysis portfolio');
    validateSavedSettings(payload.settings, portfolio);
    const signature = portfolioSignature(portfolio);
    const previous = portfoliosByVersion.get(run.portfolioVersion);
    if (previous !== undefined && previous !== signature) fail('One portfolio version refers to inconsistent saved facility inputs.');
    portfoliosByVersion.set(run.portfolioVersion, signature);
    if (payload.analysis.portfolioVersion !== undefined && payload.analysis.portfolioVersion !== run.portfolioVersion) fail('Saved analysis portfolio version conflicts with its metadata.');
    if (payload.analysis.bank !== undefined && payload.analysis.bank !== run.bank) fail('Saved analysis bank conflicts with its metadata.');
    if (run.module === 'Stress') {
      if(payload.analysis.schema !== undefined) validateJKBSnapshot(payload.analysis,payload.settings);
      else {
        if (!object(payload.analysis.config)) fail('Stress analysis is missing its calculation configuration.');
        validateSavedSettings({ stressConfig: payload.analysis.config }, portfolio);
      }
    }
    if (run.module === 'ECL') {
      if (!Array.isArray(payload.analysis.scenarios)) fail('ECL analysis is missing its economic scenarios.');
      validateSavedSettings({ eclScenarios: payload.analysis.scenarios }, portfolio);
    }
    if (run.module === 'ESG') {
      if (!object(payload.analysis.config)) fail('ESG analysis is missing its assessment configuration.');
      validateSavedSettings({ esg: payload.analysis.config }, portfolio);
    }
    if (run.module === 'RiskCube') {
      validateCubeSnapshot(payload.analysis, portfolio, payload.settings);
    }
    if(run.module==='Pivot'&&payload.analysis.source==='jkb'){
      const pivot=payload.analysis;validateJKBSnapshot(pivot.jkbAssessment,payload.settings);
      if(pivot.dimension!=='metric'||!['preShock','postShock','delta'].includes(pivot.measure)||!['','Credit','Earnings','Capital','RWA','Liquidity'].includes(pivot.category)||typeof pivot.tolerance!=='number'||pivot.tolerance<0)fail('JKB pivot metric view is invalid.');
      const expectedUnit=pivot.unit==='fraction'?'fraction':`${pivot.jkbAssessment.units.currency} ${pivot.jkbAssessment.units.amountUnit}`;
      if(pivot.unit!==expectedUnit)fail('JKB pivot unit must preserve its assessment currency and scale.');
      const selected=pivot.jkbAssessment.rows.filter(row=>row.unit===(pivot.unit==='fraction'?'fraction':'amount')&&(!pivot.category||jkbCategory(row.id)===pivot.category));
      if(!Array.isArray(pivot.groups)||pivot.groups.length!==selected.length||pivot.groups.some((row,index)=>!object(row)||row.key!==selected[index].id||row.id!==selected[index].id||row.unit!==selected[index].unit||row.category!==jkbCategory(row.id)||!near(row.value,selected[index][pivot.measure])))fail('JKB pivot rows conflict with their metric assessment or selected unit.');
    }
    runs.push({ ...run, payload: { ...payload, portfolio } });
  }
  for (const event of raw.events) {
    if (!object(event) || !text(event.id, 120) || event.id.trim() !== event.id || eventIds.has(event.id) || !timestamp(event.date) || !text(event.action, 300) || typeof event.detail !== 'string' || event.detail.length > 10_000) fail('Activity history requires unique IDs, valid timestamps and text details.');
    eventIds.add(event.id);
  }
  return { ...raw, facilities, runs };
}
