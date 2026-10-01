import ExcelJS from 'exceljs';
import { BRAND } from '@ems/config';

export interface XlsxColumn {
  header: string;
  key: string;
  width?: number;
}

/** Build a single-sheet .xlsx workbook from columns + row objects. */
export async function buildXlsx(
  sheetName: string,
  columns: XlsxColumn[],
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.productName;
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
