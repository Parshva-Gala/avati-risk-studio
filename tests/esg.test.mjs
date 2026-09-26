import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateESG, assessmentDefaults, assessmentReviewStamp, taxonomyReviewStamp, taxonomyDefaults, evidenceGates, validateESGConfig } from '../src/lib/esg.mjs';

const facility = (overrides = {}) => ({ id: 'F1', borrower: 'Sample customer', sector: 'Manufacturing', country: 'Jordan', balance: 10, undrawn: 8, ccf: .5, emissions: 1000, enterpriseValue: 100, esgScore: 70, green: true, ...overrides });
const evidence = { evidence: 'Synthetic working paper 01', owner: 'Analyst', reviewer: 'Reviewer', reviewedOn: '2026-08-01', expiresOn: '2027-08-01' };
const date = { asOf: '2026-09-27' };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('aggregates borrower financing while counting repeated inventory once', () => {
  const r = calculateESG([facility(), facility({ id: 'F2', borrower: ' SAMPLE   customer ', balance: 20 })], date);
  assert.equal(r.borrowers.length, 1); close(r.summary.financedEmissions, 300); close(r.summary.exposure, 30);
});
test('caps at borrower level rather than once for every facility', () => {
  const r = calculateESG([facility({ balance: 80 }), facility({ id: 'F2', balance: 80 })], date);
  close(r.summary.financedEmissions, 1000); assert.equal(r.summary.cappedBorrowers, 1); close(r.borrowers[0].attribution, 1);
});
test('conflicting borrower denominators or emissions reduce coverage', () => {
  for (const override of [{ enterpriseValue: 200 }, { emissions: 1100 }]) {
    const r = calculateESG([facility(), facility({ id: 'F2', ...override })], date);
    assert.equal(r.summary.financedEmissions, null); assert.equal(r.summary.dataCoverage, 0); assert.ok(r.borrowers[0].emissionReasons.length);
  }
});
test('zero inventory differs from missing emissions and denominator', () => {
  assert.equal(calculateESG([facility({ emissions: 0 })], date).summary.financedEmissions, 0);
  assert.equal(calculateESG([facility({ emissions: null })], date).summary.financedEmissions, null);
  assert.equal(calculateESG([facility({ enterpriseValue: 0 })], date).summary.financedEmissions, null);
});
test('undrawn and accounting CCF never influence emissions attribution', () => {
  const a = calculateESG([facility()], date), b = calculateESG([facility({ undrawn: 1000, ccf: 1 })], date);
  close(a.summary.financedEmissions, b.summary.financedEmissions);
});
test('scores normalize positive weights and use exposure weighted portfolio aggregation', () => {
  const r = calculateESG([facility(), facility({ id: 'F2', borrower: 'Other', balance: 30, esgScore: 90 })], { ...date, weights: { environmental: 2, social: 1, governance: 1 }, assessments: { 'sample customer': { environmental: 20, social: 80, governance: 80 } } });
  close(r.borrowers[0].score, 50); close(r.summary.weightedScore, 80);
});
test('invalid weighting and duplicate facility IDs fail validation', () => {
  assert.equal(calculateESG([facility()], { ...date, weights: { environmental: 0, social: 0, governance: 0 } }).valid, false);
  assert.equal(calculateESG([facility(), facility()], date).valid, false);
  assert.equal(calculateESG([facility({ balance: -1 })], date).valid, false);
});

test('large weighting cannot overflow a reviewed score or serialized run', () => {
  const overflow = calculateESG([facility()], { ...date, weights: { environmental: 1e308, social: 1e308, governance: 1e308 } });
  assert.equal(overflow.valid, false); assert.equal(overflow.borrowers[0].score, null);
  const large = calculateESG([facility()], { ...date, weights: { environmental: 1e300, social: 1e300, governance: 1e300 } });
  assert.equal(large.valid, true); close(large.borrowers[0].score, 70);
  assert.equal(JSON.parse(JSON.stringify(large)).summary.weightedScore, large.summary.weightedScore);
});
test('a green candidate flag never becomes an approved allocation automatically', () => {
  const r = calculateESG([facility()], date); assert.equal(r.summary.candidateBalance, 10); assert.equal(r.summary.claimedBalance, 0); assert.equal(r.taxonomy[0].approved, false);
});
test('explicit review gates emissions evidence and changes invalidate review', () => {
  const assessment = { ...assessmentDefaults([facility()]), ...evidence, emissionsConfirmed: true };
  const config = { ...date, assessments: { 'sample customer': assessment } };
  assert.equal(calculateESG([facility()], config).summary.evidenceCoverage, 0);
  assessment.reviewStamp = assessmentReviewStamp(assessment, [facility()]);
  assert.equal(calculateESG([facility()], config).summary.evidenceCoverage, 1);
  assessment.evidence = 'Changed evidence';
  assert.equal(calculateESG([facility()], config).summary.evidenceCoverage, 0);
});
test('self-review, missing references, future and expired reviews are blocked', () => {
  for (const patch of [{ reviewer: ' analyst ' }, { evidence: '' }, { reviewedOn: '2026-10-01' }, { expiresOn: '2026-01-01' }, { reviewedOn: '2026-02-30' }]) assert.ok(evidenceGates({ ...evidence, ...patch }, date.asOf).length);
});
test('taxonomy requires all gates and rejects over-allocation or critical issues', () => {
  const record = { ...taxonomyDefaults(), ...evidence, activity: 'Synthetic solar project', eligible: true, technical: true, dnsh: true, safeguards: true, allocation: true, allocated: 8 };
  record.reviewStamp = taxonomyReviewStamp(record, facility());
  const config = { ...date, taxonomy: { F1: record } };
  assert.equal(calculateESG([facility()], config).summary.claimedBalance, 8);
  for (const patch of [{ allocated: 11 }, { dnsh: false }]) {
    const changed = { ...record, ...patch }; changed.reviewStamp = taxonomyReviewStamp(changed, facility());
    assert.equal(calculateESG([facility()], { ...config, taxonomy: { F1: changed } }).summary.claimedBalance, 0);
  }
  assert.equal(calculateESG([facility()], { ...config, assessments: { 'sample customer': { criticalIssue: true } } }).summary.claimedBalance, 0);
});
test('portfolio changes invalidate inventory and claim reviews', () => {
  const assessment = { ...assessmentDefaults([facility()]), ...evidence, emissionsConfirmed: true };
  assessment.reviewStamp = assessmentReviewStamp(assessment, [facility()]);
  assert.equal(calculateESG([facility({ emissions: 2000 })], { ...date, assessments: { 'sample customer': assessment } }).summary.evidenceCoverage, 0);
  const record = { ...taxonomyDefaults(), ...evidence, activity: 'Synthetic solar project', eligible: true, technical: true, dnsh: true, safeguards: true, allocation: true, allocated: 8 };
  record.reviewStamp = taxonomyReviewStamp(record, facility());
  assert.equal(calculateESG([facility({ balance: 12 })], { ...date, taxonomy: { F1: record } }).summary.claimedBalance, 0);
});
test('calculation neither mutates inputs nor changes credit parameters', () => {
  const facilities = [facility({ pd: .02, lgd: .4 })], config = { ...date };
  const before = JSON.stringify({ facilities, config }); calculateESG(facilities, config);
  assert.equal(JSON.stringify({ facilities, config }), before);
});
test('malformed imported settings fail safely rather than reaching React inputs', () => {
  for (const config of [null, [], { asOf: {} }, { weights: 'invalid' }, { assessments: [] }, { assessments: { customer: null } }, { taxonomy: { F1: { activity: {} } } }]) {
    assert.ok(validateESGConfig(config).length);
    assert.equal(calculateESG([facility()], config).valid, false);
  }
});
