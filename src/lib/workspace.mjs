import { COLUMNS, validatePortfolio } from './portfolio.mjs';
import { validateESGConfig } from './esg.mjs';
import { calculateStress, validateScenarioWeights } from './risk.mjs';
import { buildRiskCubeProjection, validateRiskCubeProjectionInput } from './riskcube-adapter.mjs';
import { validateCubeConfig } from './cube.mjs';

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
      if (!object(payload.analysis.config)) fail('Stress analysis is missing its calculation configuration.');
      validateSavedSettings({ stressConfig: payload.analysis.config }, portfolio);
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
    runs.push({ ...run, payload: { ...payload, portfolio } });
  }
  for (const event of raw.events) {
    if (!object(event) || !text(event.id, 120) || event.id.trim() !== event.id || eventIds.has(event.id) || !timestamp(event.date) || !text(event.action, 300) || typeof event.detail !== 'string' || event.detail.length > 10_000) fail('Activity history requires unique IDs, valid timestamps and text details.');
    eventIds.add(event.id);
  }
  return { ...raw, facilities, runs };
}
