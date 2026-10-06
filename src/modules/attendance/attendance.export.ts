import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { BRAND } from '@ems/config';
import type { AttendanceReportDTO, AttendanceReportRowDTO, CompanyProfileDTO } from '@ems/types';
import { drawLetterhead, drawDocTitle } from '../../common/pdfBrand';

const ORANGE = '#FC6810';
const GRAY = '#6B7280';
const DARK = '#111827';
const RED = '#B91C1C';

export interface ReportDetailRow {
  date: string;
  employeeName: string;
  email: string;
  status: string;
  checkInAt: string;
  checkOutAt: string;
  workedMinutes: number;
}

function hm(mins: number): string {
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
}
function hoursDec(mins: number): number {
  return Math.round((mins / 60) * 100) / 100;
}

export function buildReportPdf(report: AttendanceReportDTO, company: CompanyProfileDTO): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = drawLetterhead(doc, company);
  y = drawDocTitle(
    doc,
    'Attendance Report',
    y,
    `${report.start} to ${report.end}  ·  Weekly minimum ${hm(report.weeklyMinimumMinutes)}`,
  );
  const drawMini = (title: string, rows: AttendanceReportRowDTO[], color: string): void => {
    doc.fontSize(12).fillColor(color).text(title, 50, y);
    y += 18;
    if (!rows.length) {
      doc.fontSize(10).fillColor(GRAY).text('—', 60, y);
      y += 16;
    }
    rows.forEach((r, i) => {
      doc.fontSize(10).fillColor(DARK).text(`${i + 1}. ${r.employeeName}`, 60, y, { width: 300, lineBreak: false });
      doc.text(hm(r.totalWorkedMinutes), 400, y, { width: 145, align: 'right' });
      y += 15;
    });
    y += 10;
  };
  drawMini('Top 3 — most hours', report.top, ORANGE);
  drawMini('Lowest 3 — fewest hours', report.lowest, RED);

  doc.fontSize(12).fillColor(DARK).text('All employees', 50, y);
  y += 18;
  const cols: { t: string; x: number; w: number }[] = [
    { t: 'Employee', x: 50, w: 150 },
    { t: 'Total', x: 205, w: 70 },
    { t: 'Avg/wk', x: 280, w: 65 },
    { t: 'Present', x: 350, w: 50 },
    { t: 'Absent', x: 405, w: 50 },
    { t: 'Leave', x: 455, w: 45 },
    { t: 'Short', x: 505, w: 40 },
  ];
  doc.fontSize(9).fillColor(GRAY);
  cols.forEach((c) => doc.text(c.t, c.x, y, { width: c.w, lineBreak: false }));
  y += 14;
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#E5E7EB').stroke();
  y += 6;

  for (const r of report.rows) {
    if (y > 790) {
      doc.addPage();
      y = 50;
    }
    doc.fontSize(9).fillColor(DARK).text(r.employeeName, 50, y, { width: 150, lineBreak: false });
    doc.text(hm(r.totalWorkedMinutes), 205, y, { width: 70, lineBreak: false });
    doc.text(hm(r.avgWeeklyMinutes), 280, y, { width: 65, lineBreak: false });
    doc.text(String(r.daysPresent), 350, y, { width: 50, lineBreak: false });
    doc.text(String(r.daysAbsent), 405, y, { width: 50, lineBreak: false });
    doc.text(String(r.daysOnLeave), 455, y, { width: 45, lineBreak: false });
    doc.fillColor(r.shortWeeks > 0 ? RED : DARK).text(String(r.shortWeeks), 505, y, { width: 40, lineBreak: false });
    y += 15;
  }
  if (!report.rows.length) {
    doc.fontSize(10).fillColor(GRAY).text('No employees in scope.', 50, y);
  }

  doc.end();
  return done;
}

export async function buildReportXlsx(
  report: AttendanceReportDTO,
  detail: ReportDetailRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND.productName;

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Employee', key: 'name', width: 26 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Designation', key: 'designation', width: 20 },
    { header: 'Total hours', key: 'total', width: 12 },
    { header: 'Avg hours/week', key: 'avg', width: 16 },
    { header: 'Days present', key: 'present', width: 13 },
    { header: 'Days absent', key: 'absent', width: 12 },
    { header: 'Days on leave', key: 'leave', width: 13 },
    { header: 'Short weeks', key: 'short', width: 12 },
  ];
  summary.getRow(1).font = { bold: true };
  for (const r of report.rows) {
    summary.addRow({
      name: r.employeeName,
      email: r.email,
      designation: r.designation ?? '',
      total: hoursDec(r.totalWorkedMinutes),
      avg: hoursDec(r.avgWeeklyMinutes),
      present: r.daysPresent,
      absent: r.daysAbsent,
      leave: r.daysOnLeave,
      short: r.shortWeeks,
    });
  }

  const detailWs = wb.addWorksheet('Detail');
  detailWs.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Employee', key: 'name', width: 26 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Check-in', key: 'in', width: 22 },
    { header: 'Check-out', key: 'out', width: 22 },
    { header: 'Worked hours', key: 'hours', width: 13 },
  ];
  detailWs.getRow(1).font = { bold: true };
  for (const d of detail) {
    detailWs.addRow({
      date: d.date,
      name: d.employeeName,
      email: d.email,
      status: d.status,
      in: d.checkInAt,
      out: d.checkOutAt,
      hours: hoursDec(d.workedMinutes),
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
