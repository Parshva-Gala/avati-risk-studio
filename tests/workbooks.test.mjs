import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { COLUMNS, demoPortfolio, validatePortfolio } from '../src/lib/portfolio.mjs';
import { readPortfolioWorkbook, writeWorkbookBytes } from '../src/lib/workbooks.mjs';

async function nativeWorkbook(headers = COLUMNS, rows = [demoPortfolio()[0]], name = 'Portfolio') {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(headers.map(header => row?.[header] ?? null));
  return { book, sheet };
}
async function readBook(book) { return readPortfolioWorkbook(await book.xlsx.writeBuffer()); }

test('portfolio XLSX roundtrip preserves decimals, zero, identifiers and real booleans', async () => {
  const rows = [{ ...demoPortfolio()[0], id: '0000102', balance: 12.345678901, pd: 0.00456789, watchlist: true, green: false, undrawn: 0 }];
  const bytes = await writeWorkbookBytes([{ name: 'Portfolio', rows }], 'jkb');
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const result = await readPortfolioWorkbook(input);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, rows);
  assert.deepEqual(validatePortfolio(result.rows).errors, []);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
  assert.equal(book.worksheets[0].getCell('F2').type, ExcelJS.ValueType.Number);
  assert.equal(book.worksheets[0].getCell('N2').type, ExcelJS.ValueType.Boolean);
  assert.equal(book.worksheets[0].getCell('A2').type, ExcelJS.ValueType.String);
});

test('reader chooses Portfolio over the first worksheet and otherwise uses the first', async () => {
  const rows = [demoPortfolio()[1]];
  const named = await writeWorkbookBytes([{ name: 'Read me', rows: [{ note: 'Cover' }] }, { name: 'Portfolio', rows }]);
  assert.deepEqual((await readPortfolioWorkbook(named)).rows, rows);
  const fallback = await writeWorkbookBytes([{ name: 'Facilities', rows }]);
  assert.deepEqual((await readPortfolioWorkbook(fallback)).rows, rows);
});

test('reader maps exact header names even when the columns are reordered', async () => {
  const { book } = await nativeWorkbook([...COLUMNS].reverse());
  assert.deepEqual((await readBook(book)).rows, [demoPortfolio()[0]]);
});

test('reader ignores fully empty and whitespace-only rows without losing zero or false', async () => {
  const { book, sheet } = await nativeWorkbook();
  sheet.addRow([]); sheet.addRow(COLUMNS.map(() => '   '));
  sheet.addRow(COLUMNS.map(key => demoPortfolio()[1][key]));
  const result = await readBook(book);
  assert.deepEqual(result.errors, []); assert.equal(result.rows.length, 2);
  assert.equal(result.rows[1].green, false); assert.equal(result.rows[1].daysPastDue, 0);
});

test('missing, duplicate, unsupported, case-mismatched and empty headers reject atomically', async () => {
  for (const headers of [[], COLUMNS.slice(0, -1), ['borrower', ...COLUMNS.slice(1)], ['ID', ...COLUMNS.slice(1)], ['', ...COLUMNS.slice(1)], [...COLUMNS, 'extra']]) {
    const { book } = await nativeWorkbook(headers);
    const result = await readBook(book);
    assert.equal(result.rows.length, 0); assert.ok(result.errors.length, JSON.stringify(headers));
  }
});

test('cached formula results, shared formulas and formula headers are never trusted', async () => {
  for (const address of ['F2', 'A1']) {
    const { book, sheet } = await nativeWorkbook();
    sheet.getCell(address).value = { formula: address === 'A1' ? '"id"' : '1+1', result: address === 'A1' ? 'id' : 2 };
    const result = await readBook(book);
    assert.deepEqual(result.rows, []); assert.match(result.errors[0], /Formula|formula/);
  }
  const { book, sheet } = await nativeWorkbook();
  sheet.getCell('F2').value = { formula: '1+1', result: 2, shareType: 'shared', ref: 'F2:F3' };
  sheet.getCell('F3').value = { sharedFormula: 'F2', result: 2 };
  assert.match((await readBook(book)).errors[0], /Formula|formula/);
});

test('a literal formula-looking text export remains a string rather than executable formula', async () => {
  const texts = ['=SUM(A1:A9)', '+cmd|example', '@SUM(1,2)', '-4+5'];
  const bytes = await writeWorkbookBytes([{ name: 'Text', rows: texts.map(value => ({ value })) }]);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
  texts.forEach((value, i) => { const cell = book.worksheets[0].getCell(i + 2, 1); assert.equal(cell.value, value); assert.equal(cell.type, ExcelJS.ValueType.String); });
  await assert.rejects(writeWorkbookBytes([{ name: 'Text', rows: [{ value: { formula: '1+1', result: 2 } }] }]), /Flatten nested/);
});

test('corrupt, non-XLSX and macro-enabled packages return friendly errors', async () => {
  for (const content of [new ArrayBuffer(0), new TextEncoder().encode('not an xlsx'), new Uint8Array([80, 75, 3, 4, 0, 0])]) {
    const result = await readPortfolioWorkbook(content); assert.deepEqual(result.rows, []); assert.match(result.errors[0], /workbook|\.xlsx/i);
  }
  const bytes = await writeWorkbookBytes([{ name: 'Portfolio', rows: demoPortfolio().slice(0, 1) }]);
  const zip = await JSZip.loadAsync(bytes);
  zip.file('xl/vbaProject.bin', new Uint8Array([1, 2, 3]));
  assert.match((await readPortfolioWorkbook(await zip.generateAsync({ type: 'uint8array' }))).errors[0], /Macro-enabled/);
});

test('row bounds reject distant rows before portfolio extraction', async () => {
  const { book, sheet } = await nativeWorkbook();
  sheet.getCell('A10002').value = 'Too far';
  const result = await readBook(book);
  assert.deepEqual(result.rows, []); assert.match(result.errors[0], /10,001 rows/);
});

test('merged cells and Excel error values are not silently imported', async () => {
  const merged = await nativeWorkbook(); merged.sheet.mergeCells('A2:B2');
  assert.match((await readBook(merged.book)).errors[0], /merged/);
  const error = await nativeWorkbook(); error.sheet.getCell('F2').value = { error: '#DIV/0!' };
  assert.match((await readBook(error.book)).errors[0], /Cell F2/);
});

test('exports freeze and filter headers, apply each bank accent and constrain widths', async () => {
  for (const [bank, accent] of [['midbank', '009060'], ['jkb', '285BB8'], ['jcb', '12665D'], ['nbi', 'E0BD72']]) {
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await writeWorkbookBytes([{ name: 'Review', rows: [{ value: 0.000012345678, narrative: 'Long '.repeat(50), flag: false }] }], bank));
    const sheet = book.worksheets[0];
    assert.equal(sheet.getCell('A1').fill.fgColor.argb, `FF${accent}`);
    assert.equal(sheet.views[0].state, 'frozen'); assert.equal(sheet.views[0].ySplit, 1);
    assert.equal(sheet.autoFilter, 'A1:C2');
    assert.equal(sheet.getCell('A2').value, 0.000012345678);
    assert.ok(sheet.columns.every(column => column.width >= 13 && column.width <= 44));
  }
});

test('sheet names are sanitized, bounded and unique; unsupported values reject', async () => {
  const names = ['bad:/[]*?\\name', "'badname'", 'badname', 'x'.repeat(60), 'History', '', 'a'.repeat(30)+"'long"];
  const book = new ExcelJS.Workbook(); await book.xlsx.load(await writeWorkbookBytes(names.map(name => ({ name, rows: [{ text: 'ok' }] }))));
  const emitted = book.worksheets.map(sheet => sheet.name);
  assert.equal(new Set(emitted.map(name => name.toLowerCase())).size, names.length);
  assert.ok(emitted.every(name => name.length <= 31 && !/[\\/*?:\[\]]/.test(name) && !/^'|'$/.test(name)));
  await assert.rejects(writeWorkbookBytes([{ name: 'Numbers', rows: [{ n: NaN }] }]), /finite/);
  await assert.rejects(writeWorkbookBytes([{ name: 'Numbers', rows: [{ n: Infinity }] }]), /finite/);
  await assert.rejects(writeWorkbookBytes([]), /worksheets/);
});

test('empty portfolio templates keep the complete schema and reject as missing data on import', async () => {
  const bytes = await writeWorkbookBytes([{ name: 'Portfolio', rows: [] }]);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
  assert.deepEqual(book.worksheets[0].getRow(1).values.slice(1), COLUMNS);
  assert.match((await readPortfolioWorkbook(bytes)).errors[0], /no facility rows/);
});

test('package-size preflight rejects an oversized expanded workbook before decompression', async () => {
  const bytes = new Uint8Array(await writeWorkbookBytes([{ name: 'Portfolio', rows: [demoPortfolio()[0]] }]));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at < bytes.length - 46; at++) {
    if (view.getUint32(at, true) === 0x02014b50) { view.setUint32(at + 24, 65_000_000, true); break; }
  }
  const result = await readPortfolioWorkbook(bytes);
  assert.deepEqual(result.rows, []); assert.match(result.errors[0], /64 MB import limit/);
});
