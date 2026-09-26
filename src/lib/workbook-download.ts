import type { Bank } from '../types';

export type WorkbookSheet = { name: string; rows: Record<string, unknown>[] };

/** Build and download locally; the workbook library is loaded only when needed. */
export async function downloadWorkbook(
  sheets: WorkbookSheet[],
  bank: Bank = 'midbank',
  filename = 'avati-workbook.xlsx',
): Promise<void> {
  const { writeWorkbookBytes } = await import('./workbooks.mjs');
  const bytes = await writeWorkbookBytes(sheets, bank);
  // A fresh view owns an ArrayBuffer, including when ExcelJS returns a Buffer.
  const data = new Uint8Array(bytes);
  const url = URL.createObjectURL(new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
