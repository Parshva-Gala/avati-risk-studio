import { validatePortfolio } from './portfolio.mjs';

export const RISKCUBE_COLUMNS = ['BANK_ID', 'IFRS_MODEL_UPDATION_DATE', 'MEF_DATE', 'SCENARIO_ID', 'IFRS_SEGMENT_ID', 'COUNTRY_ID', 'PERIOD_YEAR', 'PROJECTED_PD'];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = v => (typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) && String(v).trim().length > 0 && String(v).length < 160 ? String(v).trim() : null;
const country = v => v === undefined || v === null || v === '' ? null : id(v);
const numeric = v => typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim()) && Number.isFinite(Number(v)) ? Number(v) : null;
const iso = v => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:[ T]00:00:00(?:\.0+)?Z?)?$/.test(v.trim())) return null;
  const day = v.trim().slice(0, 10);
  return Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day ? day : null;
};

/** Shape validation is separate from coverage, so replacing a portfolio can reveal
 * gaps without making its previously saved export unreadable. */
export function validateRiskCubeProjectionInput(rows, selection) {
  const errors = [];
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100_000) errors.push('Provide 1–100,000 projected PD export rows.');
  if (!object(selection)) return [...errors, 'Choose a RiskCube export selection.'];
  for (const field of ['bankId', 'scenarioId']) if (!id(selection[field])) errors.push(`${field} is required.`);
  if (!iso(selection.modelDate) || !iso(selection.mefDate)) errors.push('Model and MEF dates must be valid YYYY-MM-DD dates.');
  if (!Number.isInteger(selection.firstYear) || selection.firstYear < 1900 || selection.firstYear > 2200) errors.push('First projection year must be a calendar year from 1900 to 2200.');
  if (!['fraction', 'percent'].includes(selection.pdUnit)) errors.push('Choose fraction or percent as the exported PD unit.');
  if (selection.pdBasis !== 'annual-conditional') errors.push('Confirm the export represents annual conditional PDs; cumulative and marginal PDs require conversion first.');
  if (selection.executionStatus !== undefined && selection.executionStatus !== 'COMPLETED') errors.push('Only an export marked COMPLETED may declare an execution status.');
  if (selection.sourceTable !== undefined && selection.sourceTable !== 'PROJECTED_PD_YEARWISE') errors.push('This adapter accepts PROJECTED_PD_YEARWISE exports only.');
  if (selection.segmentMap !== undefined) {
    if (!object(selection.segmentMap)) errors.push('Segment mapping must be a JSON object keyed by facility ID or sector.');
    else for (const mapping of Object.values(selection.segmentMap)) if (!object(mapping) || !id(mapping.segmentId) || (mapping.countryId !== undefined && mapping.countryId !== null && mapping.countryId !== '' && !id(mapping.countryId))) errors.push('Each segment mapping needs segmentId and an optional countryId.');
  }
  if (Array.isArray(rows)) rows.forEach((row, index) => {
    if (!object(row)) { errors.push(`Row ${index + 1}: expected a record.`); return; }
    for (const field of ['BANK_ID', 'SCENARIO_ID', 'IFRS_SEGMENT_ID']) if (!id(row[field])) errors.push(`Row ${index + 1}: ${field} is required.`);
    if (!iso(row.IFRS_MODEL_UPDATION_DATE) || !iso(row.MEF_DATE)) errors.push(`Row ${index + 1}: invalid source dates.`);
    if (row.COUNTRY_ID !== undefined && row.COUNTRY_ID !== null && row.COUNTRY_ID !== '' && !id(row.COUNTRY_ID)) errors.push(`Row ${index + 1}: invalid COUNTRY_ID.`);
    const year = numeric(row.PERIOD_YEAR), pd = numeric(row.PROJECTED_PD);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) errors.push(`Row ${index + 1}: PERIOD_YEAR must be a calendar year. Export yearwise data rather than PERIOD_ID.`);
    if (pd === null || pd < 0 || pd > (selection.pdUnit === 'percent' ? 100 : 1)) errors.push(`Row ${index + 1}: PROJECTED_PD is missing or outside the selected ${selection.pdUnit || 'PD'} unit range.`);
  });
  return [...new Set(errors)];
}

const keyOf = (segmentId, countryId, year) => JSON.stringify([segmentId, countryId, year]);
const digest = value => { const s = JSON.stringify(value); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return `riskcube-export-v1:${(h >>> 0).toString(16)}:${s.length}`; };

/** Original, read-only mapping implementation. It never calls Python, SQL or a network. */
export function buildRiskCubeProjection(facilities, rows, selection) {
  const errors = validateRiskCubeProjectionInput(rows, selection);
  const checked = validatePortfolio(facilities);
  errors.push(...checked.errors);
  const empty = { valid: false, errors, coverage: 0, exposureCoverage: 0, coveredFacilities: 0, totalFacilities: Array.isArray(facilities) ? facilities.length : 0, facilityCurves: [], facilities: [], provenance: null, trace: [] };
  if (errors.length) return empty;
  const bankId = id(selection.bankId), scenarioId = id(selection.scenarioId), modelDate = iso(selection.modelDate), mefDate = iso(selection.mefDate);
  const selected = rows.filter(row => id(row.BANK_ID) === bankId && id(row.SCENARIO_ID) === scenarioId && iso(row.IFRS_MODEL_UPDATION_DATE) === modelDate && iso(row.MEF_DATE) === mefDate).map(row => ({ segmentId: id(row.IFRS_SEGMENT_ID), countryId: country(row.COUNTRY_ID), calendarYear: numeric(row.PERIOD_YEAR), annualPd: numeric(row.PROJECTED_PD) / (selection.pdUnit === 'percent' ? 100 : 1) }));
  if (!selected.length) errors.push('No exported rows match the selected bank, model date, MEF date and scenario.');
  const indexed = new Map();
  for (const row of selected) {
    const key = keyOf(row.segmentId, row.countryId, row.calendarYear);
    if (indexed.has(key)) errors.push(`Duplicate PD row for segment ${row.segmentId}, country ${row.countryId ?? 'global'}, year ${row.calendarYear}.`);
    else indexed.set(key, row);
  }
  const curves = [], trace = [];
  let coveredExposure = 0;
  for (const facility of checked.rows) {
    const map = selection.segmentMap || {};
    const mapping = (Object.hasOwn(map, facility.id) ? map[facility.id] : Object.hasOwn(map, facility.sector) ? map[facility.sector] : null);
    const segmentId = mapping ? id(mapping.segmentId) : facility.sector;
    const countryId = mapping ? country(mapping.countryId) : null;
    const points = [], missingYears = [];
    for (let year = 1; year <= Math.ceil(facility.years); year++) {
      const calendarYear = selection.firstYear + year - 1;
      const row = indexed.get(keyOf(segmentId, countryId, calendarYear));
      if (!row) missingYears.push(calendarYear);
      else points.push({ year, annualPd: row.annualPd });
    }
    const covered = missingYears.length === 0;
    trace.push({ facilityId: facility.id, sector: facility.sector, segmentId, countryId, requiredYears: Math.ceil(facility.years), covered, missingYears });
    if (covered) { curves.push({ facilityId: facility.id, segmentId, countryId, points }); coveredExposure += facility.balance; }
    else errors.push(`${facility.id}: missing segment ${segmentId} / ${countryId ?? 'global'} PD for ${missingYears.join(', ')}.`);
  }
  const totalExposure = checked.rows.reduce((sum, f) => sum + f.balance, 0);
  const provenance = { source: 'RiskCube export', sourceTable: 'PROJECTED_PD_YEARWISE', adapterVersion: '1.0', bankId, modelDate, mefDate, scenarioId, firstYear: selection.firstYear, pdUnit: selection.pdUnit, normalizedUnit: 'fraction', pdBasis: selection.pdBasis, executionStatus: selection.executionStatus || 'Not verified from export', selectedRows: selected.length, importedRows: rows.length, dataFingerprint: digest(selected.sort((a, b) => keyOf(a.segmentId, a.countryId, a.calendarYear).localeCompare(keyOf(b.segmentId, b.countryId, b.calendarYear)))), mapping: trace.map(({ facilityId, segmentId, countryId }) => ({ facilityId, segmentId, countryId })), assumption: 'Selected native scenario is the starting conditional PD curve. Any further macro/climate shocks are additional explicit overlays.' };
  const valid = errors.length === 0;
  const curvesByFacility = new Map(curves.map(curve => [curve.facilityId, curve]));
  return { valid, errors, coverage: curves.length / checked.rows.length, exposureCoverage: totalExposure ? coveredExposure / totalExposure : null, coveredFacilities: curves.length, totalFacilities: checked.rows.length, facilityCurves: valid ? curves : [], facilities: valid ? checked.rows.map(f => ({ ...f, pd: curvesByFacility.get(f.id).points[0].annualPd })) : [], provenance, trace };
}
