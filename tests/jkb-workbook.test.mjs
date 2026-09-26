import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readJKBWorkbook, mapJKBCaseToConfig, validateJKBWorkbookData } from '../src/lib/jkb-workbook.mjs';

// All test data is independently generated; no bank workbook or bank values are
// checked in. Minimal OOXML fixtures also prove the adapter never invokes Excel.
const metadata = { currency: 'JOD', amountUnit: 'units', filename: 'synthetic-jkb.xlsm' };
const required = ['AS_OF_DATE', 'ENTITY_CODE', 'SEVERITY_CODE', 'SCENARIO_TEST_CASE_CODE', 'SCENARIO_ELEMENT_CODE', 'ELEMENT_TYPE', 'PCT_CHANGE', 'AMOUNT_CHANGE'];
const base = { AS_OF_DATE: '2026-01-31', ENTITY_CODE: 'SYNTHETIC_BANK', CET1_CAPITAL_LCY: 120.25, AT1_CAPITAL_LCY: 0, T2_CAPITAL_LCY: 10, RWA_CR_LCY: 500, RWA_MR_EQUITY_LCY: 30, RWA_MR_FOREX_LCY: 20, RWA_OR_LCY: 70, LCR_HQLA: 200, LCR_OUTFLOW: 150, LCR_INFLOW: 20, NSFR_TOTAL_ASF: 800, NSFR_TOTAL_RSF: 650, LEG_LIQ_TOTAL_ASSETS: 300, LEG_LIQ_TOTAL_LIAB: 600 };
const scenario = { AS_OF_DATE: '2026-01-31', ENTITY_CODE: 'SYNTHETIC_BANK', SEVERITY_CODE: 'MODERATE', SCENARIO_TEST_CASE_CODE: 'SYN_CR', SCENARIO_ELEMENT_CODE: 'SYN_CR_E1', SCENARIO_TEST_CASE_NAME: 'Synthetic credit migration', ELEMENT_TYPE: 'Specified portfolio segment moves from performing to NPA', PCT_CHANGE: 12.5, NUM_CUSTOMERS: 1, OUTST_LCY_STAGE1_PRE_SHOCK: 100.125, OUTST_LCY_STAGE2_PRE_SHOCK: 40, OUTST_LCY_NPA_PRE_SHOCK: 10, ECL_STAGE1_LCY_PRE_SHOCK: 1, ECL_STAGE2_LCY_PRE_SHOCK: 4, ECL_NPA_LCY_PRE_SHOCK: 5, IIS_STAGE1_PRE_SHOCK: 0, IIS_STAGE2_PRE_SHOCK: 0, IIS_NPA_PRE_SHOCK: 0, RWA_CR_RATIO_STAGE1: .75, RWA_CR_RATIO_STAGE2: 1, RWA_CR_RATIO_NPA: 1.5, RWA_CR_STAGE1_LCY_PRE_SHOCK: 75, RWA_CR_STAGE2_LCY_PRE_SHOCK: 40, RWA_CR_NPA_LCY_PRE_SHOCK: 15, MAX_ECL_STRESS_ECL_STAGE1: 50, MAX_ECL_STRESS_ECL_STAGE2: 20, TOTAL_RWA: 630.375, REGULATORY_CAR: .2, IMPACT_ECL_LCY: 12.75 };
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const column = index => { let text = ''; for (let number = index + 1; number; number = Math.floor((number - 1) / 26)) text = String.fromCharCode(65 + (number - 1) % 26) + text; return text; };
const cell = (ref, value) => typeof value === 'number' ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;

async function fixture({ records = [base, scenario], headerRow = 3, headers, macro = true, formula = false, otherFormula = false, extraXml = '', date1904 = false } = {}) {
  const zip = new JSZip();
  headers ||= [...new Set([...required, ...records.flatMap(Object.keys)])];
  const rows = `<row r="${headerRow}">${headers.map((header, index) => cell(`${column(index)}${headerRow}`, header)).join('')}</row>` + records.map((record, index) => {
    const r = headerRow + index + 1;
    return `<row r="${r}">${headers.map((header, index) => record[header] === undefined ? '' : cell(`${column(index)}${r}`, record[header])).join('')}</row>`;
  }).join('');
  zip.file('[Content_Types].xml', `<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.${macro ? 'ms-excel.sheet.macroEnabled' : 'openxmlformats-officedocument.spreadsheetml.sheet'}.main+xml"/></Types>`);
  zip.file('xl/workbook.xml', `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="${date1904 ? 1 : 0}"/><sheets><sheet name="Scenario Element Output" sheetId="1" r:id="rId1"/><sheet name="Recon_Workbench" sheetId="2" r:id="rId2"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><dimension ref="A1:FC1048144"/><sheetData>${rows}${formula ? '<row r="100"><c r="A100"><f>1+1</f><v>2</v></c></row>' : ''}${extraXml}</sheetData></worksheet>`);
  zip.file('xl/worksheets/sheet2.xml', `<worksheet><sheetData>${otherFormula ? '<row r="1"><c r="A1"><f>WEBSERVICE("https://invalid.test/")</f><v>99999</v></c></row>' : ''}</sheetData></worksheet>`);
  if (macro) zip.file('xl/vbaProject.bin', 'Synthetic inert payload that is never read');
  zip.file('xl/embeddings/ignored.bin', 'Never read');
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

test('reads the actual row-3/row-1 layout and ignores styled empty distant rows', async () => {
  for (const headerRow of [1, 3]) {
    const result = await readJKBWorkbook(await fixture({ headerRow, extraXml: '<row r="1048144"><c r="FC1048144" s="1"/></row>' }), metadata);
    assert.deepEqual(result.errors, []);
    assert.equal(result.source.headerRow, headerRow);
    assert.equal(result.source.caseCount, 1);
    assert.equal(result.cases[0].inputs.stage1Exposure, 100.125);
    assert.equal(result.cases[0].inputs.at1, 0);
    assert.equal(result.cases[0].inputs.rwaMarket, 50);
    assert.equal(result.cases[0].inputs.rwaOtherCredit, 370);
    assert.equal(result.cases[0].shock.pct, .125);
    assert.equal(result.cases[0].inputs.rwStage3, 1.5);
    assert.match(result.cases[0].provenance.rwaOtherCredit, /^Derived:/);
    assert.equal(result.source.amountConversion, 'none');
  }
});

test('macros and unrelated calculated sheets are ignored; source formula caches reject atomically', async () => {
  const safe = await readJKBWorkbook(await fixture({ otherFormula: true }), metadata);
  assert.deepEqual(safe.errors, []);
  assert.equal(safe.source.containsMacros, true);
  assert.equal(safe.source.macroContentIgnored, true);
  const rejected = await readJKBWorkbook(await fixture({ formula: true }), metadata);
  assert.match(rejected.errors[0], /contains formulas/);
  assert.deepEqual(rejected.cases, []);
  assert.deepEqual(rejected.outputs, []);
});

test('amount currency and scale must be explicit; numeric amounts remain unchanged', async () => {
  const bytes = await fixture();
  for (const options of [{}, { currency: 'LCY', amountUnit: 'units' }, { currency: 'USD', amountUnit: 'billions' }]) assert.ok((await readJKBWorkbook(bytes, options)).errors.length);
  const result = await readJKBWorkbook(bytes, { currency: 'EUR', amountUnit: 'thousands', filename: 'C:/private/synthetic.xlsx' });
  assert.equal(result.source.currency, 'EUR');
  assert.equal(result.source.amountUnit, 'thousands');
  assert.equal(result.source.filename, 'synthetic.xlsx');
  assert.equal(result.cases[0].inputs.stage1Exposure, 100.125);
});

test('only identical repeated observations collapse and conflicting duplicates block import', async () => {
  const same = await readJKBWorkbook(await fixture({ records: [base, scenario, { ...scenario }] }), metadata);
  assert.equal(same.cases.length, 1);
  assert.ok(same.warnings.some(warning => warning.includes('1 exact duplicate')));
  const conflict = await readJKBWorkbook(await fixture({ records: [base, scenario, { ...scenario, TOTAL_RWA: 1 }] }), metadata);
  assert.match(conflict.errors[0], /Conflicting duplicate/);
  assert.equal(conflict.cases.length, 0);
});

test('baseline lookup matches entity and reporting date and never borrows another bank total', async () => {
  const result = await readJKBWorkbook(await fixture({ records: [base, { ...scenario, ENTITY_CODE: 'SYNTHETIC_OTHER' }] }), metadata);
  assert.deepEqual(result.errors, []);
  assert.equal(result.cases[0].hasBaseline, false);
  assert.equal(result.cases[0].inputs.cet1, undefined);
  assert.equal(result.cases[0].inputs.rwaOtherCredit, undefined);
  assert.ok(result.warnings.some(warning => warning.includes('no matching BASE')));
  const ambiguous = await readJKBWorkbook(await fixture({ records: [base, { ...base }, scenario] }), metadata);
  assert.match(ambiguous.errors[0], /Multiple BASE/);
});

test('interest-rate shocks use basis points and signed operational amounts keep their sign', async () => {
  const result = await readJKBWorkbook(await fixture({ records: [base, { ...scenario, ELEMENT_TYPE: 'Interest rate change', PCT_CHANGE: 250, RSA_LCY: 100, RSL_LCY: 150 }] }), metadata);
  assert.equal(result.cases[0].shock.pct, .025);
  const loss = await readJKBWorkbook(await fixture({ records: [base, { ...scenario, ELEMENT_TYPE: 'Specific loss', AMOUNT_CHANGE: -12.375 }] }), metadata);
  const config = mapJKBCaseToConfig(loss, loss.cases[0].key);
  assert.equal(config.overrides['operational-loss'].MODERATE.amount, -12.375);
  assert.equal(config.overrides['operational-loss'].MODERATE.pct, 0);
});

test('missing native inputs remain missing; mapping discards old demo values and source shocks', async () => {
  const result = await readJKBWorkbook(await fixture(), metadata);
  const config = mapJKBCaseToConfig(result, result.cases[0].key, { inputs: { taxRate: .25, stage1Exposure: 999999 }, currency: 'USD', amountUnit: 'millions', overrides: { other: { SEVERE: {} } } });
  assert.equal(config.inputs.taxRate, null);
  assert.equal(config.inputs.stage1Exposure, 100.125);
  assert.equal(config.currency, 'JOD');
  assert.equal(config.basis, 'workbook');
  assert.equal(config.source.caseKey, result.cases[0].key);
  assert.ok(config.source.missingInputs.includes('taxRate'));
  assert.deepEqual(Object.keys(config.overrides), ['credit-migration']);
  assert.deepEqual(config.depositors, []);
  assert.throws(() => mapJKBCaseToConfig(result, 'missing'), /Choose a scenario/);
});

test('saved output values are labeled snapshots and never replace pre-shock inputs', async () => {
  const result = await readJKBWorkbook(await fixture(), metadata);
  assert.equal(result.outputs[0].status, 'imported-system-snapshot');
  assert.equal(result.outputs[0].values.TOTAL_RWA, 630.375);
  assert.equal(result.outputs[0].values.REGULATORY_CAR, .2);
  assert.equal(result.outputs[0].values.IMPACT_ECL_LCY, 12.75);
  assert.equal(result.cases[0].inputs.cet1, 120.25);
  assert.equal(result.cases[0].inputs.taxRate, undefined);
});

test('severity comparisons import only matching native shocks on the same pre-shock basis', async () => {
  const result = await readJKBWorkbook(await fixture({ records: [base, scenario, { ...scenario, SEVERITY_CODE: 'MEDIUM', PCT_CHANGE: 25 }, { ...scenario, SEVERITY_CODE: 'SEVERE', PCT_CHANGE: 50, OUTST_LCY_STAGE1_PRE_SHOCK: 200 }] }), metadata);
  const config = mapJKBCaseToConfig(result, result.cases[0].key);
  assert.equal(config.overrides['credit-migration'].MEDIUM.pct, .25);
  assert.equal(config.overrides['credit-migration'].SEVERE, undefined);
  assert.deepEqual(config.source.availableSeverities, ['MODERATE', 'MEDIUM']);
  assert.match(config.source.unavailableSeverities[0].reason, /pre-shock inputs differ/);
  assert.ok(!config.source.missingInputs.includes('fxLong'));
  assert.equal(config.inputs.fxLong, null);
});

test('unsupported native mechanisms remain inspectable but cannot be applied as another case', async () => {
  const result = await readJKBWorkbook(await fixture({ records: [base, { ...scenario, ELEMENT_TYPE: 'Synthetic unsupported mechanism' }] }), metadata);
  assert.deepEqual(result.errors, []);
  assert.throws(() => mapJKBCaseToConfig(result, result.cases[0].key), /does not have a browser calculation/);
});

test('missing and duplicate native headers, malformed numeric cells and invalid dates reject', async () => {
  const minimal = [...required];
  assert.match((await readJKBWorkbook(await fixture({ headers: minimal.filter(header => header !== 'ENTITY_CODE'), records: [scenario] }), metadata)).errors[0], /Missing required/);
  assert.match((await readJKBWorkbook(await fixture({ headers: [...minimal, 'AS_OF_DATE'], records: [scenario] }), metadata)).errors[0], /unique native/);
  assert.match((await readJKBWorkbook(await fixture({ records: [base, { ...scenario, PCT_CHANGE: 'not numeric' }] }), metadata)).errors[0], /finite number/);
  assert.match((await readJKBWorkbook(await fixture({ records: [base, { ...scenario, AS_OF_DATE: '2026-02-31' }] }), metadata)).errors[0], /invalid calendar/);
  assert.match((await readJKBWorkbook(await fixture({ records: [base, { ...scenario, SEVERITY_CODE: 'UNRECOGNIZED' }] }), metadata)).errors[0], /native severity/);
});

test('Excel serial dates respect the 1900 and 1904 date systems', async () => {
  for (const [date1904, serial] of [[false, 46053], [true, 44591]]) {
    const result = await readJKBWorkbook(await fixture({ date1904, records: [{ ...base, AS_OF_DATE: serial }, { ...scenario, AS_OF_DATE: serial }] }), metadata);
    assert.deepEqual(result.errors, []);
    assert.equal(result.cases[0].asOf, '2026-01-31');
  }
});

test('negative other-credit RWA does not become a fabricated zero input', async () => {
  const result = await readJKBWorkbook(await fixture({ records: [{ ...base, RWA_CR_LCY: 1 }, scenario] }), metadata);
  assert.equal(result.cases[0].inputs.rwaOtherCredit, undefined);
  assert.ok(result.cases[0].missingInputs.includes('rwaOtherCredit'));
});

test('backup validation rejects tampered identities, nonfinite values and incomplete missing-input lists', async () => {
  const original = await readJKBWorkbook(await fixture(), metadata);
  assert.deepEqual(validateJKBWorkbookData(original), original);
  const tamper = change => { const clone = structuredClone(original); change(clone); assert.throws(() => validateJKBWorkbookData(clone)); };
  tamper(value => { value.cases[0].inputs.taxRate = Infinity; });
  tamper(value => { value.cases[0].key = 'different'; });
  tamper(value => { value.cases[0].missingInputs = []; });
  tamper(value => { value.source.currency = 'LCY'; });
  tamper(value => { value.outputs[0].status = 'verified'; });
  tamper(value => { value.outputs[0].values.FORMULA = 12; });
  const extras = { ...original, arbitraryCache: { private: true } };
  assert.equal(validateJKBWorkbookData(extras).arbitraryCache, undefined);
});

test('corrupt archives and unsupported macro templates fail with no partial data', async () => {
  assert.ok((await readJKBWorkbook(new Uint8Array([0, 1, 2]), metadata)).errors.length);
  const zip = await JSZip.loadAsync(await fixture());
  zip.file('[Content_Types].xml', '<Types><Override ContentType="application/vnd.ms-excel.template.macroEnabled.main+xml"/></Types>');
  const result = await readJKBWorkbook(await zip.generateAsync({ type: 'uint8array' }), metadata);
  assert.match(result.errors[0], /binary workbooks and templates/);
  assert.deepEqual(result.cases, []);
});
