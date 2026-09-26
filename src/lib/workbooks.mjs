import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { COLUMNS } from './portfolio.mjs';

const MAX_ROWS = 10_000;
const MAX_BYTES = 15_000_000;
const MAX_EXPANDED_BYTES = 64_000_000;
const THEMES = {
  midbank: { accent: '009060', ink: 'FFFFFF', stripe: 'F0F7F3' },
  jkb: { accent: '285BB8', ink: 'FFFFFF', stripe: 'EDF3FC' },
  jcb: { accent: '12665D', ink: 'FFFFFF', stripe: 'EFF5F0' },
  nbi: { accent: 'E0BD72', ink: '182536', stripe: 'F6F3EB' },
};
const invalid = message => { throw new Error(message); };
const empty = value => value == null || (typeof value === 'string' && !value.trim());

function bytesOf(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  invalid('Choose an .xlsx workbook. The file could not be read as binary data.');
}

// Read ZIP directory sizes before decompressing XML. ExcelJS is a document
// reader, so both the compressed and expanded package need bounded sizes.
function checkPackageSize(bytes) {
  if (!bytes.length || bytes.length > MAX_BYTES) invalid('Choose an .xlsx workbook under 15 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.length) {
      end = at;
      break;
    }
  }
  if (end < 0) invalid('This file is not a readable .xlsx workbook. Save it as Excel Workbook (.xlsx) and try again.');
  const entries = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  let cursor = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) ||
      view.getUint16(end + 8, true) !== entries || entries === 0xffff || entries > 2048 ||
      cursor + size > end) invalid('This workbook package is too large or uses an unsupported ZIP format.');
  const directoryEnd = cursor + size;
  let expanded = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > directoryEnd || view.getUint32(cursor, true) !== 0x02014b50) invalid('The .xlsx package is damaged. Save a fresh copy and try again.');
    if (view.getUint16(cursor + 8, true) & 1) invalid('Encrypted workbooks are not supported. Use an unencrypted .xlsx copy.');
    expanded += view.getUint32(cursor + 24, true);
    if (expanded > MAX_EXPANDED_BYTES) invalid('This workbook expands beyond the 64 MB import limit. Export just the Portfolio worksheet.');
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  if (cursor !== directoryEnd) invalid('The .xlsx package directory is invalid. Save a fresh copy and try again.');
}

function unescapeXML(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
    if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[code.toLowerCase()];
  });
}

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/gs)].map(match => [match[1], unescapeXML(match[3])]));
}

async function xmlPart(zip, path) {
  const file = zip.file(path);
  if (!file) invalid('The .xlsx workbook is missing a required package part. Save a fresh copy and try again.');
  const text = await file.async('string');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) invalid('This workbook contains unsupported XML declarations. Save a fresh .xlsx copy.');
  return text;
}

async function preflight(bytes) {
  checkPackageSize(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const types = await xmlPart(zip, '[Content_Types].xml');
  if (/macroEnabled|vbaProject/i.test(types) || Object.keys(zip.files).some(name => /(?:^|\/)vbaProject\./i.test(name))) {
    invalid('Macro-enabled workbooks are not supported. Export a values-only .xlsx copy of the Portfolio worksheet.');
  }
  if (!types.includes('spreadsheetml.sheet.main+xml')) invalid('Choose a standard Excel Workbook (.xlsx), not a template, binary workbook or macro-enabled file.');
  const workbookXML = await xmlPart(zip, 'xl/workbook.xml');
  const sheets = [...workbookXML.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map(match => attributes(match[0]));
  const chosen = sheets.find(sheet => sheet.name === 'Portfolio') || sheets[0];
  if (!chosen) invalid('The workbook contains no worksheets.');
  const relationships = await xmlPart(zip, 'xl/_rels/workbook.xml.rels');
  const rel = [...relationships.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map(match => attributes(match[0])).find(item => item.Id === chosen['r:id']);
  if (!rel || rel.TargetMode === 'External' || !/\/worksheet$/.test(rel.Type || '')) invalid('The selected sheet is not a supported worksheet.');
  const target = new URL(rel.Target, 'https://xlsx.invalid/xl/workbook.xml');
  if (target.origin !== 'https://xlsx.invalid') invalid('External worksheet references are not supported.');
  const sheetXML = await xmlPart(zip, decodeURIComponent(target.pathname.slice(1)));
  const dimension = sheetXML.match(/<(?:\w+:)?dimension\b[^>]*\bref=["']([^"']+)["']/)?.[1];
  const lastDeclaredRow = Number(dimension?.match(/(\d+)$/)?.[1] || 0);
  const rows = [...sheetXML.matchAll(/<(?:\w+:)?row\b[^>]*>/g)];
  const lastActualRow = rows.reduce((last, row) => Math.max(last, Number(attributes(row[0]).r || last + 1)), 0);
  if (rows.length > MAX_ROWS + 1 || lastDeclaredRow > MAX_ROWS + 1 || lastActualRow > MAX_ROWS + 1) {
    invalid('The selected worksheet must stay within 10,001 rows including its header. Remove unused distant rows or split the import.');
  }
  // Reject formulas before ExcelJS reads cached results, including shared and
  // array formulas. Only literal source values cross the interchange boundary.
  if (/<(?:\w+:)?f(?:\s|\/?>)/.test(sheetXML)) invalid('Formula cells are not accepted. Copy the Portfolio worksheet and paste values before importing; cached formula results are not trusted.');
  if (/<(?:\w+:)?mergeCell\b/.test(sheetXML)) invalid('The Portfolio table cannot contain merged cells. Unmerge them in a values-only copy.');
  return chosen.name;
}

function sourceValue(cell) {
  const value = cell.value;
  if (empty(value)) return null;
  if (cell.type === ExcelJS.ValueType.Formula || (typeof value === 'object' && ('formula' in value || 'sharedFormula' in value))) {
    invalid(`Cell ${cell.address} contains a formula. Paste values before importing; cached results are not trusted.`);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
  if (value && typeof value.text === 'string' && typeof value.hyperlink === 'string') return value.text;
  invalid(`Cell ${cell.address} has an unsupported value. Use plain text, finite numbers or TRUE/FALSE; dates and Excel errors are not supported in portfolio fields.`);
}

/** Extract literal records. The caller then applies validatePortfolio() so
 * XLSX and CSV use exactly the same financial and required-value rules. */
export async function readPortfolioWorkbook(input) {
  try {
    const bytes = bytesOf(input);
    const selectedName = await preflight(bytes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const sheet = workbook.getWorksheet(selectedName);
    if (!sheet) invalid('The selected worksheet could not be read. Save a fresh .xlsx copy.');
    if (sheet.rowCount > MAX_ROWS + 1) invalid('This workspace accepts up to 10,000 facilities per import.');
    const headers = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, cell => { headers[cell.col - 1] = sourceValue(cell); });
    while (headers.length && empty(headers.at(-1))) headers.pop();
    if (!headers.length) invalid(`Row 1 must contain the portfolio column headers: ${COLUMNS.join(', ')}.`);
    const errors = [];
    const seen = new Set();
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (typeof header !== 'string' || !header) errors.push(`Header column ${i + 1} is empty or is not text.`);
      else if (seen.has(header)) errors.push(`Duplicate column header: ${header}.`);
      else if (!COLUMNS.includes(header)) errors.push(`Unsupported column header: ${header}. Header names are case-sensitive.`);
      seen.add(header);
    }
    for (const column of COLUMNS) if (!seen.has(column)) errors.push(`Missing required column: ${column}.`);
    if (errors.length) return { rows: [], errors };
    const records = [];
    for (let index = 2; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index);
      let populated = false;
      const record = {};
      for (let column = 1; column <= Math.max(headers.length, row.cellCount); column++) {
        const value = sourceValue(row.getCell(column));
        if (!empty(value)) populated = true;
        if (column > headers.length && !empty(value)) invalid(`Row ${index} has data beyond the declared portfolio columns.`);
        if (column <= headers.length) record[headers[column - 1]] = value;
      }
      if (populated) records.push(record);
    }
    if (!records.length) invalid('The portfolio worksheet contains no facility rows.');
    return { rows: records, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const known = /^(Choose|This|The |Macro-enabled|External|Formula|Cell |Row |Header |Missing |Duplicate |Unsupported |Encrypted)/.test(message);
    return { rows: [], errors: [known ? message : 'The .xlsx workbook could not be read. It may be damaged, encrypted or an unsupported format. Save a fresh Excel Workbook (.xlsx) and try again.'] };
  }
}

function safeSheetName(raw, used, index) {
  const base = (String(raw || '').replace(/[\\/*?:\[\]\x00-\x1f]/g, ' ').trim().replace(/^'+|'+$/g, '').trim() || `Sheet ${index + 1}`).slice(0, 31).replace(/'+$/g, '').trim();
  let name = base.toLowerCase() === 'history' ? 'History data' : base;
  let sequence = 2;
  while (used.has(name.toLowerCase())) { const suffix = ` (${sequence++})`; name = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(name.toLowerCase());
  return name;
}

function exportValue(value, location) {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(`${location}: export requires a finite number.`);
    return value;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > 32_767) invalid(`${location}: text exceeds Excel's 32,767-character cell limit.`);
    return value; // ExcelJS stores strings as text, even when they begin with '='.
  }
  invalid(`${location}: use text, numbers, booleans or empty values. Flatten nested objects before export.`);
}

/** Export portable .xlsx values with a consistent bank-coloured table style.
 * No formula, macro, external link or executable cell objects are generated. */
export async function writeWorkbookBytes(sheets, bank = 'midbank') {
  if (!Array.isArray(sheets) || !sheets.length || sheets.length > 32) invalid('Export requires from 1 to 32 worksheets.');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Avati Risk Studio';
  workbook.subject = 'Values-only analytical interchange';
  const theme = THEMES[bank] || THEMES.midbank;
  const used = new Set();
  for (let index = 0; index < sheets.length; index++) {
    const spec = sheets[index];
    if (!spec || !Array.isArray(spec.rows) || spec.rows.length > MAX_ROWS) invalid('Each export worksheet requires an array of up to 10,000 records.');
    if (spec.rows.some(row => !row || typeof row !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(row)))) invalid('Each export row must be a plain record.');
    const name = safeSheetName(spec.name, used, index);
    let columns = [...new Set(spec.rows.flatMap(row => Object.keys(row)))];
    if (name === 'Portfolio' && (!columns.length || COLUMNS.every(key => columns.includes(key)))) {
      columns = [...COLUMNS, ...columns.filter(key => !COLUMNS.includes(key))];
    }
    if (!columns.length) columns = ['No records'];
    if (columns.length > 256 || columns.some(key => !key.trim() || key.length > 256)) invalid('Use from 1 to 256 non-empty export column names, each under 257 characters.');
    const sheet = workbook.addWorksheet(name, { properties: { tabColor: { argb: `FF${theme.accent}` }, defaultRowHeight: 21 }, views: [{ state: 'frozen', ySplit: 1, activeCell: 'A2', showGridLines: false }] });
    sheet.addRow(columns);
    for (let rowIndex = 0; rowIndex < spec.rows.length; rowIndex++) {
      sheet.addRow(columns.map(key => exportValue(spec.rows[rowIndex][key], `${name}, row ${rowIndex + 2}, ${key}`)));
    }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: columns.length } };
    sheet.getRow(1).height = 30;
    sheet.getRow(1).eachCell(cell => {
      cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: `FF${theme.ink}` } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${theme.accent}` } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    for (let column = 1; column <= columns.length; column++) {
      let longest = columns[column - 1].length;
      sheet.getColumn(column).eachCell({ includeEmpty: false }, cell => { longest = Math.max(longest, Math.min(42, String(cell.value ?? '').length)); });
      sheet.getColumn(column).width = Math.max(13, Math.min(44, longest + 2));
    }
    for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex++) {
      const row = sheet.getRow(rowIndex);
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF182536' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowIndex % 2 ? `FF${theme.stripe}` : 'FFFFFFFF' } };
        cell.alignment = { vertical: 'top', wrapText: true, horizontal: typeof cell.value === 'number' ? 'right' : 'left' };
        if (typeof cell.value === 'number') cell.numFmt = '#,##0.###############';
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E7EC' } } };
      });
    }
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
  }
  return workbook.xlsx.writeBuffer();
}
