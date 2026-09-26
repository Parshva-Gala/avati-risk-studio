import { JKB_CASES, JKB_INPUT_FIELDS, getJKBRequiredInputs } from './jkb-stress.mjs';

const SHEET = 'Scenario Element Output';
const SEVERITIES = ['MODERATE', 'MEDIUM', 'SEVERE'];
const REQUIRED = ['AS_OF_DATE', 'ENTITY_CODE', 'SEVERITY_CODE', 'SCENARIO_TEST_CASE_CODE', 'SCENARIO_ELEMENT_CODE', 'ELEMENT_TYPE', 'PCT_CHANGE', 'AMOUNT_CHANGE'];
const STAGE_FIELDS = {
  stage1Exposure: 'OUTST_LCY_STAGE1_PRE_SHOCK', stage2Exposure: 'OUTST_LCY_STAGE2_PRE_SHOCK', stage3Exposure: 'OUTST_LCY_NPA_PRE_SHOCK',
  stage1Ecl: 'ECL_STAGE1_LCY_PRE_SHOCK', stage2Ecl: 'ECL_STAGE2_LCY_PRE_SHOCK', stage3Ecl: 'ECL_NPA_LCY_PRE_SHOCK',
  stage1Iis: 'IIS_STAGE1_PRE_SHOCK', stage2Iis: 'IIS_STAGE2_PRE_SHOCK', stage3Iis: 'IIS_NPA_PRE_SHOCK',
  rwStage1: 'RWA_CR_RATIO_STAGE1', rwStage2: 'RWA_CR_RATIO_STAGE2', rwStage3: 'RWA_CR_RATIO_NPA',
  maxEclStage1: 'MAX_ECL_STRESS_ECL_STAGE1', maxEclStage2: 'MAX_ECL_STRESS_ECL_STAGE2',
  fxLong: 'FX_TOTAL_LONG_POSITION_LCY_PRE_SHOCK', fxShort: 'FX_TOTAL_SHORT_POSITION_LCY_PRE_SHOCK',
  rsa: 'RSA_LCY', rsl: 'RSL_LCY', marketValue: 'MARKET_VALUE_LCY',
  selectedHqla: 'PRE_LCR_HQLA', selectedOutflows: 'PRE_LCR_OUTFLOW', selectedInflows: 'PRE_LCR_INFLOW',
  selectedAsf: 'PRE_NSFR_ASF', selectedRsf: 'PRE_NSFR_RSF',
  selectedLiquidAssets: 'PRE_LEG_LIQ_TOTAL_ASSETS', selectedLiquidLiabilities: 'PRE_LEG_LIQ_TOTAL_LIAB',
};
const BASE_FIELDS = {
  cet1: 'CET1_CAPITAL_LCY', at1: 'AT1_CAPITAL_LCY', t2: 'T2_CAPITAL_LCY',
  rwaFx: 'RWA_MR_FOREX_LCY', rwaOperational: 'RWA_OR_LCY', pbt: 'PROFITS_BEFORE_TAX_LCY', taxRate: 'TAX_RATE',
  hqla: 'LCR_HQLA', outflows: 'LCR_OUTFLOW', inflows: 'LCR_INFLOW',
  asf: 'NSFR_TOTAL_ASF', rsf: 'NSFR_TOTAL_RSF', liquidAssets: 'LEG_LIQ_TOTAL_ASSETS', liquidLiabilities: 'LEG_LIQ_TOTAL_LIAB',
};
const INPUT_KEYS = new Set(JKB_INPUT_FIELDS.map(field => field.key));
const SYSTEM_FIELDS = new Set(['OUTST_LCY', 'ECL_LCY', 'RWA_CR_LCY', 'RWA_MR_EQUITY_LCY', 'RWA_MR_FOREX_LCY', 'RWA_OR_LCY', 'TOTAL_RWA', 'MARKET_VALUE_LCY', 'PROFITS_BEFORE_TAX_LCY', 'PROFITS_AFTER_TAX_LCY', 'CET1_CAPITAL_LCY', 'AT1_CAPITAL_LCY', 'T2_CAPITAL_LCY', 'TOTAL_CAPITAL_LCY', 'REGULATORY_CAR', 'CET1_CAR', 'LEG_LIQ_TOTAL_ASSETS', 'LEG_LIQ_TOTAL_LIAB', 'LEGAL_LIQUIDITY_RATIO', 'LCR_HQLA', 'LCR_OUTFLOW', 'LCR_INFLOW', 'LCR', 'NSFR_TOTAL_ASF', 'NSFR_TOTAL_RSF', 'NSFR']);
const fail = message => { throw new Error(message); };
const blank = value => value == null || value === '';
const has = (object, key) => Object.hasOwn(object, key);

function xmlText(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) fail('The workbook contains invalid XML text.');
      return String.fromCodePoint(point);
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[code.toLowerCase()];
  });
}
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)].map(match => [match[1], xmlText(match[3])]));
const cleanText = value => String(value ?? '').replace(/_x([0-9a-f]{4})_/gi, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
const textNodes = xml => [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t\s*>/g)].map(match => xmlText(match[1])).join('');

// Bound the ZIP before decompressing. VBA, HTA, embedded objects and workbook
// connections are never loaded; only workbook metadata, shared strings and the
// single fixed source worksheet are read as text.
function packageBytes(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
  if (!bytes || !bytes.length || bytes.length > 20_000_000) fail('Choose a JKB .xlsm or .xlsx workbook under 20 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) { end = at; break; }
  }
  if (end < 0) fail('The file is not a readable Excel workbook package. Encrypted and legacy .xls files are not supported.');
  const entries = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true);
  let cursor = view.getUint32(end + 16, true), expanded = 0;
  if (entries > 4096 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== entries || cursor + size > end) fail('The workbook ZIP format is unsupported.');
  const directoryEnd = cursor + size;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > directoryEnd || view.getUint32(cursor, true) !== 0x02014b50) fail('The workbook package is damaged.');
    if (view.getUint16(cursor + 8, true) & 1) fail('Encrypted workbooks are not supported.');
    const expandedPart = view.getUint32(cursor + 24, true);
    expanded += expandedPart;
    if (expandedPart > 80_000_000 || expanded > 128_000_000) fail('The workbook exceeds the 128 MB expanded import limit.');
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  if (cursor !== directoryEnd) fail('The workbook package directory is invalid.');
  return bytes;
}

async function xmlPart(zip, path, optional = false) {
  const entry = zip.file(path);
  if (!entry) { if (optional) return ''; fail('The workbook is missing a required XML part.'); }
  const text = await entry.async('string');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('XML entities and document declarations are not supported.');
  return text;
}

function sourceRows(xml, strings) {
  if (/<(?:\w+:)?f(?:\s|\/?>)/.test(xml)) fail('The Scenario Element Output sheet contains formulas. Cached formula results are not trusted; import a values-only source extract.');
  const rows = new Map();
  let count = 0;
  // Some old builds contain over a million empty styled rows. Iterate populated
  // cells instead of allocating their declared rectangular used range.
  for (const match of xml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c\s*>)/g)) {
    const attr = attributes(match[1]), body = match[2] || '';
    const raw = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v\s*>/)?.[1];
    if (raw == null && attr.t !== 'inlineStr') continue;
    const reference = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(attr.r || '');
    if (!reference || Number(reference[2]) > 1_048_576) fail('The source worksheet contains an invalid cell address.');
    const rowIndex = Number(reference[2]), column = reference[1];
    let value;
    if (attr.t === 's') {
      const index = Number(raw);
      if (!Number.isInteger(index) || index < 0 || index >= strings.length) fail('The source worksheet contains an invalid text reference.');
      value = strings[index];
    } else if (attr.t === 'inlineStr') value = textNodes(body);
    else if (attr.t === 'str' || attr.t === 'd') value = xmlText(raw || '');
    else if (attr.t === 'e') fail(`Source cell ${attr.r} contains an Excel error. Fix the source value before importing.`);
    else if (attr.t === 'b') value = raw === '1';
    else {
      value = Number(raw);
      if (!raw?.trim() || !Number.isFinite(value)) fail(`Source cell ${attr.r} does not contain a finite number.`);
    }
    if (typeof value === 'string') value = cleanText(value);
    if (blank(value)) continue;
    if (++count > 500_000) fail('The source worksheet exceeds the 500,000 populated-cell import limit.');
    if (!rows.has(rowIndex)) rows.set(rowIndex, new Map());
    if (rows.size > 10_010) fail('The source worksheet exceeds 10,000 scenario records.');
    const row = rows.get(rowIndex);
    if (row.has(column)) fail(`Duplicate source cell ${attr.r}.`);
    row.set(column, value);
  }
  return rows;
}

function asOf(value, date1904) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1 || value > 150_000 || (!date1904 && value === 60)) fail('AS_OF_DATE must contain a valid date without a time component.');
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, value < 60 ? 31 : 30);
    return new Date(epoch + value * 86_400_000).toISOString().slice(0, 10);
  }
  const text = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z?)?$/.test(text)) fail('AS_OF_DATE must be an Excel date or an ISO date (YYYY-MM-DD).');
  const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== text.slice(0, 10)) fail('AS_OF_DATE contains an invalid calendar date.');
  return text.slice(0, 10);
}

function number(record, field) {
  if (blank(record.values[field])) return undefined;
  const raw = record.values[field];
  if ((typeof raw !== 'number' && (typeof raw !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw))) || !Number.isFinite(Number(raw))) fail(`${SHEET}!${record.cells[field]}: ${field} must contain a finite number.`);
  return Number(raw);
}

function mapped(record, mapping) {
  const inputs = {}, provenance = {};
  if (!record) return { inputs, provenance };
  for (const [key, field] of Object.entries(mapping)) {
    const value = number(record, field);
    if (value !== undefined) { inputs[key] = value; provenance[key] = `${SHEET}!${record.cells[field]}`; }
  }
  return { inputs, provenance };
}

function baseline(record) {
  const result = mapped(record, BASE_FIELDS);
  const equity = number(record, 'RWA_MR_EQUITY_LCY'), forex = number(record, 'RWA_MR_FOREX_LCY');
  if (equity !== undefined && forex !== undefined) {
    result.inputs.rwaMarket = equity + forex;
    result.provenance.rwaMarket = `Derived sum: ${SHEET}!${record.cells.RWA_MR_EQUITY_LCY} + ${record.cells.RWA_MR_FOREX_LCY}`;
  }
  return result;
}

/** Read only the native JKB scenario table. Currency and amount unit are user
 * declarations because LCY column names do not identify either. Amounts retain
 * their native scale; no FX conversion, rescaling or formula execution occurs. */
export async function readJKBWorkbook(input, options = {}) {
  const result = { source: null, cases: [], baselineInputs: {}, baselines: [], outputs: [], warnings: [], errors: [] };
  try {
    const currency = cleanText(options.currency).toUpperCase(), amountUnit = options.amountUnit;
    if (!/^[A-Z]{3}$/.test(currency) || currency === 'LCY') fail('Declare the three-letter source currency before importing. LCY alone does not identify a currency.');
    if (!['units', 'thousands', 'millions'].includes(amountUnit)) fail('Declare the source amount unit: units, thousands or millions. Amounts are not converted.');
    const bytes = packageBytes(input);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const types = await xmlPart(zip, '[Content_Types].xml');
    if (!/spreadsheetml\.sheet\.main\+xml|ms-excel\.sheet\.macroEnabled\.main\+xml/.test(types)) fail('Choose a standard .xlsx or .xlsm workbook; binary workbooks and templates are not supported.');
    const workbookXML = await xmlPart(zip, 'xl/workbook.xml');
    const sheets = [...workbookXML.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map(match => attributes(match[0]));
    if (sheets.length > 256) fail('The workbook exceeds the 256-sheet import limit.');
    const selected = sheets.filter(sheet => sheet.name === SHEET);
    if (selected.length !== 1) fail(`Expected one worksheet named ${SHEET}. Choose the JKB stress pack or its source extract.`);
    const relationships = await xmlPart(zip, 'xl/_rels/workbook.xml.rels');
    const relationship = [...relationships.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map(match => attributes(match[0])).find(rel => rel.Id === selected[0]['r:id']);
    if (!relationship || relationship.TargetMode === 'External' || !/\/worksheet$/.test(relationship.Type || '')) fail('The source worksheet relationship is invalid or external.');
    const target = new URL(relationship.Target, 'https://jkb.invalid/xl/workbook.xml');
    const targetPath = decodeURIComponent(target.pathname.slice(1));
    if (target.origin !== 'https://jkb.invalid' || !/^xl\/worksheets\/[^/]+\.xml$/.test(targetPath)) fail('External or unsupported source worksheet paths are not accepted.');
    const stringsXML = await xmlPart(zip, 'xl/sharedStrings.xml', true);
    const strings = [...stringsXML.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si\s*>/g)].map(match => textNodes(match[1]));
    if (strings.length > 500_000) fail('The workbook contains too many shared text entries.');
    const rows = sourceRows(await xmlPart(zip, targetPath), strings);
    const candidates = [...rows.entries()].filter(([row, cells]) => row <= 10 && [...cells.values()].includes('AS_OF_DATE'));
    if (candidates.length !== 1) fail('Could not identify a unique JKB scenario header within the first 10 rows.');
    const [headerRow, headerCells] = candidates[0], headers = [...headerCells.values()];
    if (headers.some(header => typeof header !== 'string' || !/^[A-Z][A-Z0-9_]{0,99}$/.test(header)) || new Set(headers).size !== headers.length || headers.length > 256) fail('Source headers must be unique native JKB field names.');
    const missing = REQUIRED.filter(header => !headers.includes(header));
    if (missing.length) fail(`Missing required JKB columns: ${missing.join(', ')}.`);
    const date1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904=["'](?:1|true)["']/.test(workbookXML);
    const records = [...rows.entries()].filter(([row]) => row > headerRow).map(([rowIndex, cells]) => {
      const values = {}, addresses = {};
      for (const [column, value] of cells) {
        const header = headerCells.get(column);
        if (!header) fail(`Source row ${rowIndex} contains a value outside its declared headers.`);
        values[header] = value; addresses[header] = `${column}${rowIndex}`;
      }
      const record = { values, cells: addresses, rowIndex, asOf: asOf(values.AS_OF_DATE, date1904), entity: cleanText(values.ENTITY_CODE) };
      if (!record.entity) fail(`Source row ${rowIndex} is missing ENTITY_CODE.`);
      return record;
    });
    if (!records.length || records.length > 10_000) fail('The JKB source table must contain from 1 to 10,000 records.');
    const baseRecords = new Map();
    for (const record of records.filter(record => blank(record.values.SEVERITY_CODE) && blank(record.values.SCENARIO_TEST_CASE_CODE) && blank(record.values.SCENARIO_ELEMENT_CODE))) {
      const key = JSON.stringify([record.asOf, record.entity]);
      if (baseRecords.has(key)) fail('Multiple BASE rows exist for the same entity and date. Import a single unambiguous source run.');
      baseRecords.set(key, record);
      result.baselines.push({ asOf: record.asOf, entity: record.entity, row: record.rowIndex, ...baseline(record) });
    }
    if (result.baselines.length === 1) result.baselineInputs = { ...result.baselines[0].inputs };
    const caseKeys = new Map();
    let duplicates = 0;
    for (const record of records) {
      if (baseRecords.get(JSON.stringify([record.asOf, record.entity])) === record) continue;
      const severity = cleanText(record.values.SEVERITY_CODE).toUpperCase(), scenarioId = cleanText(record.values.SCENARIO_TEST_CASE_CODE), elementId = cleanText(record.values.SCENARIO_ELEMENT_CODE), elementType = cleanText(record.values.ELEMENT_TYPE);
      if (!SEVERITIES.includes(severity) || !scenarioId || !elementId || !elementType) fail(`Source row ${record.rowIndex} requires a native severity, scenario code, element code and element type.`);
      const key = JSON.stringify([record.asOf, record.entity, scenarioId, elementId, severity]);
      if (caseKeys.has(key)) {
        if (headers.every(field => caseKeys.get(key).values[field] === record.values[field])) { duplicates++; continue; }
        fail('Conflicting duplicate scenario/entity/date/severity rows found. Select a single source run before importing.');
      }
      caseKeys.set(key, record);
      const baseRecord = baseRecords.get(JSON.stringify([record.asOf, record.entity]));
      const base = baseRecord ? baseline(baseRecord) : { inputs: {}, provenance: {} };
      const scoped = mapped(record, STAGE_FIELDS);
      const inputs = { ...base.inputs, ...scoped.inputs }, provenance = { ...base.provenance, ...scoped.provenance };
      const creditTotal = baseRecord ? number(baseRecord, 'RWA_CR_LCY') : undefined;
      const stageRwaFields = ['RWA_CR_STAGE1_LCY_PRE_SHOCK', 'RWA_CR_STAGE2_LCY_PRE_SHOCK', 'RWA_CR_NPA_LCY_PRE_SHOCK'];
      const stageRwa = stageRwaFields.map(field => number(record, field));
      if (creditTotal !== undefined && stageRwa.every(value => value !== undefined)) {
        const other = creditTotal - stageRwa.reduce((sum, value) => sum + value, 0);
        if (other >= 0) { inputs.rwaOtherCredit = other; provenance.rwaOtherCredit = `Derived: ${SHEET}!${baseRecord.cells.RWA_CR_LCY} minus ${stageRwaFields.map(field => record.cells[field]).join(', ')}`; }
      }
      const shock = {}, nativePct = number(record, 'PCT_CHANGE'), amount = number(record, 'AMOUNT_CHANGE'), customers = number(record, 'NUM_CUSTOMERS');
      if (nativePct !== undefined) shock.pct = nativePct / (elementType.toLowerCase() === 'interest rate change' ? 10_000 : 100);
      if (amount !== undefined) shock.amount = amount;
      if (customers !== undefined) { if (!Number.isInteger(customers) || customers < 0) fail(`NUM_CUSTOMERS must be a non-negative integer at row ${record.rowIndex}.`); shock.numCustomers = customers; }
      const missingInputs = [...INPUT_KEYS].filter(inputKey => !has(inputs, inputKey));
      result.cases.push({ key, scenarioId, elementId, severity, asOf: record.asOf, entity: record.entity, elementType, label: cleanText(record.values.SCENARIO_TEST_CASE_NAME) || scenarioId, row: record.rowIndex, inputs, shock, missingInputs, provenance, hasBaseline: Boolean(baseRecord) });
      const values = {};
      for (const field of headers.filter(field => SYSTEM_FIELDS.has(field) || field.startsWith('IMPACT_') || field.startsWith('NSFR_IMPACT_'))) {
        const value = number(record, field);
        if (value !== undefined) values[field] = value;
      }
      result.outputs.push({ caseKey: key, values, status: 'imported-system-snapshot' });
    }
    if (!result.cases.length) fail('No scenario rows were found below the JKB source header.');
    result.source = {
      filename: cleanText(options.filename).split(/[\\/]/).at(-1) || 'JKB workbook',
      version: sheets.some(sheet => sheet.name === 'Recon_Workbench') ? 'JKB reconciliation pack' : 'JKB scenario builder pack',
      sheets: sheets.map(sheet => ({ name: sheet.name, visibility: sheet.state || 'visible' })), headerRow, sourceSheet: SHEET,
      macroContentIgnored: true, containsMacros: /macroEnabled|vbaProject/i.test(types), currency, amountUnit,
      amountConversion: 'none', recordCount: records.length, caseCount: result.cases.length,
    };
    result.warnings.push('Saved system outputs are imported snapshots. They have not been recalculated or independently validated.', 'Amounts retain the declared source currency and scale. Workbook formulas, macros, configuration code, hidden source caches and external connections are not executed or imported.', 'The missing-input list covers all model fields; the selected stress case determines which gaps block calculation.');
    if (duplicates) result.warnings.push(`${duplicates} exact duplicate scenario rows were removed. Conflicting duplicate rows are never combined.`);
    if (result.cases.some(item => !item.hasBaseline)) result.warnings.push('Some scenarios have no matching BASE row for their entity and date. Baseline capital and liquidity inputs remain unavailable.');
    return result;
  } catch (error) {
    // Atomic failure: a partially read pack must never look ready to apply.
    return { source: null, cases: [], baselineInputs: {}, baselines: [], outputs: [], warnings: [], errors: [error instanceof Error ? error.message : 'The JKB workbook could not be read. Save a fresh .xlsm or .xlsx copy and try again.'] };
  }
}

/** Validate persisted parsed data without reopening a workbook or executing any
 * content. Returns a plain JSON copy and throws on invalid or oversized input. */
export function validateJKBWorkbookData(value) {
  const object = item => item && typeof item === 'object' && !Array.isArray(item) && [Object.prototype, null].includes(Object.getPrototypeOf(item));
  const str = (item, limit = 500) => typeof item === 'string' && item.length > 0 && item.length <= limit;
  const strings = (items, limit = 1000) => Array.isArray(items) && items.length <= limit && items.every(item => str(item, 2000));
  const finiteRecord = (item, keys) => object(item) && Object.entries(item).every(([key, number]) => keys.has(key) && typeof number === 'number' && Number.isFinite(number));
  const provenance = item => object(item) && Object.entries(item).every(([key, ref]) => INPUT_KEYS.has(key) && str(ref, 1000));
  const date = item => { try { return typeof item === 'string' && asOf(item, false) === item; } catch { return false; } };
  if (!object(value) || !object(value.source) || !Array.isArray(value.errors) || value.errors.length || !strings(value.warnings, 100)) fail('The saved JKB workbook is invalid.');
  const source = value.source;
  if (!str(source.filename) || !str(source.version) || source.sourceSheet !== SHEET || source.macroContentIgnored !== true || typeof source.containsMacros !== 'boolean' || !/^[A-Z]{3}$/.test(source.currency) || source.currency === 'LCY' || !['units', 'thousands', 'millions'].includes(source.amountUnit) || source.amountConversion !== 'none' || !Number.isInteger(source.headerRow) || source.headerRow < 1 || source.headerRow > 10) fail('The saved JKB source metadata is invalid.');
  if (!Array.isArray(source.sheets) || !source.sheets.length || source.sheets.length > 256 || source.sheets.some(sheet => !object(sheet) || !str(sheet.name, 31) || !['visible', 'hidden', 'veryHidden'].includes(sheet.visibility))) fail('The saved JKB sheet inventory is invalid.');
  if (!Array.isArray(value.cases) || !value.cases.length || value.cases.length > 10_000 || source.caseCount !== value.cases.length || !Number.isInteger(source.recordCount) || source.recordCount < value.cases.length || source.recordCount > 10_000) fail('The saved JKB scenario inventory is invalid.');
  const caseKeys = new Set();
  for (const item of value.cases) {
    if (!object(item) || !str(item.scenarioId) || !str(item.elementId) || !str(item.entity) || !str(item.elementType) || !str(item.label, 1000) || !SEVERITIES.includes(item.severity) || !date(item.asOf) || item.key !== JSON.stringify([item.asOf, item.entity, item.scenarioId, item.elementId, item.severity]) || caseKeys.has(item.key) || !Number.isInteger(item.row) || item.row <= source.headerRow || item.row > 1_048_576 || typeof item.hasBaseline !== 'boolean') fail('A saved JKB scenario identity is invalid or duplicated.');
    caseKeys.add(item.key);
    if (!finiteRecord(item.inputs, INPUT_KEYS) || !provenance(item.provenance) || !finiteRecord(item.shock, new Set(['pct', 'amount', 'numCustomers'])) || (has(item.shock, 'numCustomers') && (!Number.isInteger(item.shock.numCustomers) || item.shock.numCustomers < 0))) fail('Saved JKB inputs must be literal finite numeric values with recognized fields.');
    const missing = [...INPUT_KEYS].filter(key => !has(item.inputs, key));
    if (!strings(item.missingInputs, INPUT_KEYS.size) || new Set(item.missingInputs).size !== item.missingInputs.length || missing.length !== item.missingInputs.length || missing.some(key => !item.missingInputs.includes(key))) fail('The saved JKB missing-input list is inconsistent.');
  }
  if (!Array.isArray(value.baselines) || value.baselines.length > 10_000 || !finiteRecord(value.baselineInputs, INPUT_KEYS)) fail('The saved JKB baseline inputs are invalid.');
  const baseKeys = new Set();
  for (const base of value.baselines) {
    const key = JSON.stringify([base?.asOf, base?.entity]);
    if (!object(base) || !str(base.entity) || !date(base.asOf) || baseKeys.has(key) || !Number.isInteger(base.row) || base.row <= source.headerRow || !finiteRecord(base.inputs, INPUT_KEYS) || !provenance(base.provenance)) fail('A saved JKB baseline is invalid or duplicated.');
    baseKeys.add(key);
  }
  if (value.cases.some(item => item.hasBaseline !== baseKeys.has(JSON.stringify([item.asOf, item.entity])))) fail('The saved JKB baseline matching is inconsistent.');
  if (!Array.isArray(value.outputs) || value.outputs.length !== value.cases.length) fail('The saved JKB output snapshots are invalid.');
  const outputKeys = new Set();
  for (const output of value.outputs) {
    if (!object(output) || !caseKeys.has(output.caseKey) || outputKeys.has(output.caseKey) || output.status !== 'imported-system-snapshot' || !object(output.values) || Object.keys(output.values).length > 256 || Object.entries(output.values).some(([key, number]) => !/^[A-Z][A-Z0-9_]{0,99}$/.test(key) || !(SYSTEM_FIELDS.has(key) || key.startsWith('IMPACT_') || key.startsWith('NSFR_IMPACT_')) || typeof number !== 'number' || !Number.isFinite(number))) fail('A saved JKB system-output snapshot is invalid.');
    outputKeys.add(output.caseKey);
  }
  // Serialize only schema-owned fields. Extra backup fields cannot smuggle source
  // caches, executable objects, private paths or arbitrary nested payloads.
  const safe = {
    source: Object.fromEntries(['filename', 'version', 'sheets', 'headerRow', 'sourceSheet', 'macroContentIgnored', 'containsMacros', 'currency', 'amountUnit', 'amountConversion', 'recordCount', 'caseCount'].map(key => [key, source[key]])),
    cases: value.cases.map(item => Object.fromEntries(['key', 'scenarioId', 'elementId', 'severity', 'asOf', 'entity', 'elementType', 'label', 'row', 'inputs', 'shock', 'missingInputs', 'provenance', 'hasBaseline'].map(key => [key, item[key]]))),
    baselineInputs: value.baselineInputs,
    baselines: value.baselines.map(base => ({ asOf: base.asOf, entity: base.entity, row: base.row, inputs: base.inputs, provenance: base.provenance })),
    outputs: value.outputs.map(output => ({ caseKey: output.caseKey, values: output.values, status: output.status })),
    warnings: value.warnings, errors: [],
  };
  safe.source.sheets = source.sheets.map(sheet => ({ name: sheet.name, visibility: sheet.visibility }));
  const json = JSON.stringify(safe);
  if (json.length > 16_000_000) fail('The saved JKB workbook exceeds the 16 MB parsed-data limit.');
  return JSON.parse(json);
}

/** Select one native observation. Missing inputs remain null and are listed in
 * source metadata, so a previous demo or another bank cannot supply them. */
export function mapJKBCaseToConfig(workbook, nativeKey, config = {}) {
  const checked = validateJKBWorkbookData(workbook);
  const selected = checked.cases.find(item => item.key === nativeKey);
  if (!selected) fail('Choose a scenario from the imported JKB workbook.');
  const mechanism = JKB_CASES.find(item => item.kind.toLowerCase() === selected.elementType.toLowerCase());
  if (!mechanism) fail(`The native element type "${selected.elementType}" does not have a browser calculation mechanism yet.`);
  const inputs = Object.fromEntries(JKB_INPUT_FIELDS.map(field => [field.key, has(selected.inputs, field.key) ? selected.inputs[field.key] : null]));
  const shockFor = item => {
    const shock = { pct: item.shock.pct ?? null, amount: mechanism.id === 'profit-change' ? item.shock.amount ?? 0 : 0, numCustomers: 1 };
    if (mechanism.id === 'operational-loss') { shock.pct = 0; shock.amount = item.shock.amount ?? null; }
    if (mechanism.id === 'credit-concentration' || mechanism.id === 'liquidity-concentration') { shock.pct = 1; shock.numCustomers = item.shock.numCustomers ?? null; }
    return shock;
  };
  const shock = shockFor(selected);
  const missingShocks = Object.keys(shock).filter(key => shock[key] === null);
  const required = getJKBRequiredInputs(mechanism.id, 'workbook');
  const severityOverrides = { [selected.severity]: shock };
  const availableSeverities = [selected.severity], unavailableSeverities = [];
  for (const severity of SEVERITIES.filter(value => value !== selected.severity)) {
    const sibling = checked.cases.find(item => item.asOf === selected.asOf && item.entity === selected.entity && item.scenarioId === selected.scenarioId && item.elementId === selected.elementId && item.elementType === selected.elementType && item.severity === severity);
    if (!sibling) { unavailableSeverities.push({ severity, reason: 'No matching native observation.' }); continue; }
    if (required.some(key => sibling.inputs[key] !== selected.inputs[key])) { unavailableSeverities.push({ severity, reason: 'Native pre-shock inputs differ. Apply that observation separately.' }); continue; }
    const siblingShock = shockFor(sibling);
    if (Object.values(siblingShock).some(value => value === null)) { unavailableSeverities.push({ severity, reason: 'Native shock inputs are incomplete.' }); continue; }
    severityOverrides[severity] = siblingShock;
    availableSeverities.push(severity);
  }
  return {
    ...config, caseId: mechanism.id, severity: selected.severity, basis: 'workbook', sector: '', currency: checked.source.currency, amountUnit: checked.source.amountUnit,
    inputs, overrides: { [mechanism.id]: severityOverrides }, depositors: [],
    source: { filename: checked.source.filename, version: checked.source.version, caseKey: selected.key, scenarioId: selected.scenarioId, elementId: selected.elementId, elementType: selected.elementType, severity: selected.severity, asOf: selected.asOf, entity: selected.entity, row: selected.row, sourceSheet: SHEET, currency: checked.source.currency, amountUnit: checked.source.amountUnit, missingInputs: selected.missingInputs.filter(key => required.includes(key)), missingShocks, availableSeverities, unavailableSeverities, provenance: { ...selected.provenance }, systemOutputStatus: 'imported-system-snapshot' },
  };
}
