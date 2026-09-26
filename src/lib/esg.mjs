// Transparent internal screening model. Amounts: USD millions; emissions: tCO2e.
// This module never changes credit parameters or turns candidate flags into claims.
export const ESG_METHOD = 'Avati internal ESG screening · 1.0';
const finite = x => typeof x === 'number' && Number.isFinite(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const sum = xs => xs.reduce((a, b) => a + b, 0);
export const borrowerKey = name => String(name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export const DEFAULT_ESG_CONFIG = { asOf: '2026-09-27', weights: { environmental: 40, social: 30, governance: 30 }, assessments: {}, taxonomy: {} };
const day = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validateESGConfig(input) {
  const issues = [];
  if (!object(input)) return ['ESG settings must be a JSON object.'];
  if (input.asOf !== undefined && (typeof input.asOf !== 'string' || input.asOf.length > 10)) issues.push('ESG reporting date must be an ISO date string.');
  if (input.weights !== undefined && (!object(input.weights) || Object.values(input.weights).some(value => !finite(value)))) issues.push('ESG weights must contain finite numbers.');
  for (const key of ['assessments', 'taxonomy']) {
    if (input[key] === undefined) continue;
    if (!object(input[key])) { issues.push(`ESG ${key} must be a record map.`); continue; }
    for (const record of Object.values(input[key])) {
      if (!object(record)) { issues.push(`ESG ${key} contains an invalid record.`); break; }
      for (const [field, value] of Object.entries(record)) {
        if (['environmental', 'social', 'governance', 'allocated'].includes(field)) { if (value !== null && !finite(value)) issues.push(`ESG ${field} must be numeric or empty.`); }
        else if (['emissionsConfirmed', 'criticalIssue', 'eligible', 'technical', 'dnsh', 'safeguards', 'allocation'].includes(field)) { if (typeof value !== 'boolean') issues.push(`ESG ${field} must be true or false.`); }
        else if (typeof value !== 'string' || value.length > 4000) issues.push(`ESG ${field} must be text of at most 4,000 characters.`);
      }
    }
  }
  return [...new Set(issues)];
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter(k => k !== 'reviewStamp').sort().map(k => [k, canonical(value[k])])) : value;
export function reviewFingerprint(record) {
  const input = JSON.stringify(canonical(record));
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `internal-review-v1:${(hash >>> 0).toString(16)}:${input.length}`;
}
export function assessmentReviewStamp(record, facilities) {
  return reviewFingerprint({ record, portfolioContext: facilities.map(f => ({ id: f.id, borrower: borrowerKey(f.borrower), balance: f.balance, emissions: f.emissions, enterpriseValue: f.enterpriseValue, esgScore: f.esgScore })).sort((a, b) => a.id.localeCompare(b.id)) });
}
export function taxonomyReviewStamp(record, facility) {
  return reviewFingerprint({ record, portfolioContext: { id: facility.id, borrower: borrowerKey(facility.borrower), balance: facility.balance, green: facility.green } });
}
export function evidenceGates(record = {}, asOf) {
  const reasons = [];
  if (!text(record.evidence)) reasons.push('Add an evidence reference.');
  if (!text(record.owner) || !text(record.reviewer)) reasons.push('Enter an owner and reviewer.');
  if (text(record.owner) && text(record.reviewer) && borrowerKey(record.owner) === borrowerKey(record.reviewer)) reasons.push('Owner and reviewer must be different.');
  if (!day(asOf) || !day(record.reviewedOn) || !day(record.expiresOn)) reasons.push('Enter valid reporting, review and expiry dates.');
  else if (record.reviewedOn > asOf || record.expiresOn < asOf || record.expiresOn < record.reviewedOn) reasons.push('Review must be current at the reporting date.');
  return reasons;
}
export function assessmentDefaults(rows) {
  const valid = rows.filter(f => finite(f.esgScore) && f.esgScore >= 0 && f.esgScore <= 100);
  const score = valid.length ? sum(valid.map(f => f.esgScore)) / valid.length : null;
  return { environmental: score, social: score, governance: score, evidence: '', owner: '', reviewer: '', reviewedOn: '', expiresOn: '', emissionsConfirmed: false, criticalIssue: false };
}
export function taxonomyDefaults() {
  return { scheme: 'Internal activity screening v1', activity: '', eligible: false, technical: false, dnsh: false, safeguards: false, allocation: false, allocated: 0, evidence: '', owner: '', reviewer: '', reviewedOn: '', expiresOn: '' };
}
const sameNumber = (rows, field) => {
  const values = rows.map(r => r[field]);
  return values.every(v => finite(v)) && values.every(v => Math.abs(v - values[0]) <= 1e-8) ? values[0] : null;
};

export function calculateESG(facilities, input = {}) {
  const configIssues = validateESGConfig(input);
  if (configIssues.length) { const safe = calculateESG(facilities, {}); return { ...safe, valid: false, issues: configIssues }; }
  const config = { ...DEFAULT_ESG_CONFIG, ...input, weights: { ...DEFAULT_ESG_CONFIG.weights, ...(input.weights || {}) } };
  const issues = [];
  if (!day(config.asOf)) issues.push('Reporting date must be a valid ISO date.');
  const pillars = ['environmental', 'social', 'governance'];
  const weightTotal = sum(pillars.map(p => finite(config.weights[p]) ? config.weights[p] : 0));
  const weightsValid = pillars.every(p => finite(config.weights[p]) && config.weights[p] >= 0) && finite(weightTotal) && weightTotal > 0;
  if (!weightsValid) issues.push('Pillar weights must be nonnegative and have a finite total greater than zero.');
  const seen = new Set();
  const groups = new Map();
  for (const f of facilities || []) {
    if (!f || !text(f.id) || seen.has(f.id) || !text(f.borrower) || !finite(f.balance) || f.balance < 0) { issues.push('Facilities require unique IDs, borrower names and nonnegative balances.'); continue; }
    seen.add(f.id);
    const key = borrowerKey(f.borrower);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const borrowers = [...groups.entries()].map(([key, rows]) => {
    const balance = sum(rows.map(f => f.balance));
    const assessment = { ...assessmentDefaults(rows), ...(config.assessments?.[key] || {}) };
    const scoresValid = pillars.every(p => finite(assessment[p]) && assessment[p] >= 0 && assessment[p] <= 100);
    const score = weightsValid && scoresValid ? sum(pillars.map(p => assessment[p] * (config.weights[p] / weightTotal))) : null;
    const evidenceReasons = evidenceGates(assessment, config.asOf);
    const reviewed = evidenceReasons.length === 0 && scoresValid && assessment.reviewStamp === assessmentReviewStamp(assessment, rows);
    const emissions = sameNumber(rows, 'emissions'), enterpriseValue = sameNumber(rows, 'enterpriseValue');
    const emissionReasons = [];
    if (emissions === null || emissions < 0) emissionReasons.push('Borrower emissions are missing, invalid or conflicting across facilities.');
    if (enterpriseValue === null || enterpriseValue <= 0) emissionReasons.push('Enterprise value must be positive and consistent across facilities.');
    const covered = emissionReasons.length === 0;
    const rawAttribution = covered ? balance / enterpriseValue : null;
    const attribution = covered ? Math.min(1, rawAttribution) : null;
    if (rawAttribution !== null && rawAttribution > 1) emissionReasons.push('Combined financing exceeds enterprise value; attribution capped at 100%. Review denominator and group scope.');
    const financedEmissions = covered ? emissions * attribution : null;
    const grade = score === null ? 'Unrated' : score >= 75 ? 'A' : score >= 55 ? 'B' : score >= 35 ? 'C' : 'D';
    return { key, name: rows[0].borrower, sector: rows[0].sector, country: rows[0].country, rows, balance, assessment, score, grade, evidenceReasons, reviewed, evidenceState: reviewed ? 'Reviewed record' : assessment.reviewStamp ? 'Review required' : 'Evidence pending', esDecision: assessment.criticalIssue ? 'Hold — unresolved critical issue' : reviewed ? 'Screened — no critical flag' : 'Due diligence pending', emissions, enterpriseValue, rawAttribution, attribution, financedEmissions, covered, emissionReasons, capped: rawAttribution !== null && rawAttribution > 1, verifiedEmissions: reviewed && assessment.emissionsConfirmed === true && covered };
  });
  const byBorrower = new Map(borrowers.map(b => [b.key, b]));
  const taxonomy = [...groups.values()].flat().map(f => {
    const record = { ...taxonomyDefaults(), ...(config.taxonomy?.[f.id] || {}) };
    const reasons = evidenceGates(record, config.asOf);
    if (!text(record.scheme) || !text(record.activity)) reasons.push('Identify the scheme and activity.');
    for (const [key, label] of [['eligible', 'Eligibility'], ['technical', 'Technical criteria'], ['dnsh', 'Do no significant harm'], ['safeguards', 'Minimum safeguards'], ['allocation', 'Use of proceeds']]) if (record[key] !== true) reasons.push(`${label} requires supported confirmation.`);
    if (!finite(record.allocated) || record.allocated <= 0 || record.allocated > f.balance) reasons.push('Claim allocation must be positive and no greater than the drawn facility balance.');
    if (byBorrower.get(borrowerKey(f.borrower))?.assessment.criticalIssue) reasons.push('Borrower has an unresolved critical issue.');
    const reviewed = record.reviewStamp === taxonomyReviewStamp(record, f);
    const approved = reasons.length === 0 && reviewed;
    return { id: f.id, borrower: f.borrower, balance: f.balance, candidate: f.green === true, record, reasons, reviewed, approved, status: approved ? 'Reviewed internal claim' : f.green ? 'Candidate · not verified' : 'Not assessed', claimedBalance: approved ? record.allocated : 0 };
  });
  const exposure = sum(borrowers.map(b => b.balance));
  const coveredExposure = sum(borrowers.filter(b => b.covered).map(b => b.balance));
  const reviewedExposure = sum(borrowers.filter(b => b.verifiedEmissions).map(b => b.balance));
  const ratedExposure = sum(borrowers.filter(b => b.score !== null).map(b => b.balance));
  const financedEmissions = coveredExposure > 0 ? sum(borrowers.filter(b => b.covered).map(b => b.financedEmissions)) : null;
  const weightedScore = ratedExposure > 0 ? sum(borrowers.filter(b => b.score !== null).map(b => b.balance * b.score)) / ratedExposure : null;
  return { method: ESG_METHOD, valid: issues.length === 0, issues, config, weightTotal, borrowers, taxonomy, summary: { exposure, weightedScore, ratedExposure, financedEmissions, coveredExposure, dataCoverage: exposure ? coveredExposure / exposure : null, reviewedExposure, evidenceCoverage: exposure ? reviewedExposure / exposure : null, criticalHolds: borrowers.filter(b => b.assessment.criticalIssue).length, cappedBorrowers: borrowers.filter(b => b.capped).length, candidateBalance: sum(taxonomy.filter(t => t.candidate).map(t => t.balance)), claimedBalance: sum(taxonomy.map(t => t.claimedBalance)), reviewedClaims: taxonomy.filter(t => t.approved).length }, distribution: ['A', 'B', 'C', 'D', 'Unrated'].map(grade => ({ grade, count: borrowers.filter(b => b.grade === grade).length, balance: sum(borrowers.filter(b => b.grade === grade).map(b => b.balance)) })) };
}
