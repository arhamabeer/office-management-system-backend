import PDFDocument from 'pdfkit';
import { BRAND } from '@ems/config';
import type { PayslipDTO, TaxCertificateDTO } from '@ems/types';

const ORANGE = '#FC6810';
const GRAY = '#6B7280';
const DARK = '#111827';

function money(n: number, cur: string): string {
  return `${cur} ${new Intl.NumberFormat('en-US').format(Math.round(n))}`;
}

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, subtitle: string): void {
  doc.fontSize(22).fillColor(ORANGE).text(BRAND.productName, 50, 50, { continued: false });
  doc.fillColor(DARK).fontSize(12).text(subtitle, 50, 78);
  doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#E5E7EB').stroke();
  doc.moveDown(2);
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string, y: number): void {
  doc.fontSize(10).fillColor(GRAY).text(label, 50, y);
  doc.fillColor(DARK).text(value, 250, y);
}

export async function generatePayslipPdf(p: PayslipDTO): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  header(doc, `Payslip — ${p.month}`);

  let y = 120;
  kv(doc, 'Employee', p.employeeName ?? p.userId, y);
  y += 18;
  kv(doc, 'Pay period', p.month, y);
  y += 18;
  kv(doc, 'Tax year', p.taxYearLabel ?? '—', y);
  y += 30;

  const line = (label: string, amount: number) => {
    doc.fontSize(11).fillColor(DARK).text(label, 50, y).text(money(amount, p.currency), 380, y, { width: 165, align: 'right' });
    y += 22;
  };
  doc.fontSize(12).fillColor(ORANGE).text('Monthly', 50, y);
  y += 20;
  line('Salary (gross)', p.grossMonthly);
  line('Income tax', p.taxMonthly);
  y += 6;

  doc.rect(50, y, 495, 30).fill('#F1F3F5');
  doc.fillColor(DARK).fontSize(13).text('Net pay', 60, y + 8).text(money(p.netPay, p.currency), 400, y + 8, { width: 135, align: 'right' });
  y += 50;

  doc.fontSize(9).fillColor(GRAY).text(
    `Year-to-date — Gross ${money(p.ytdGross, p.currency)} · Tax ${money(p.ytdTax, p.currency)} · Net ${money(p.ytdNet, p.currency)}`,
    50,
    y,
  );
  y += 24;
  doc.fontSize(8).fillColor(GRAY).text('This is a system-generated payslip.', 50, y);

  return toBuffer(doc);
}

export async function generateCertificatePdf(c: TaxCertificateDTO): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  header(doc, `Tax Certificate — Tax Year ${c.taxYearLabel}`);

  let y = 120;
  kv(doc, 'Employee', c.employeeName, y);
  y += 18;
  kv(doc, 'Tax year', c.taxYearLabel, y);
  y += 18;
  kv(doc, 'Months included', String(c.months), y);
  y += 34;

  const rows: [string, number][] = [
    ['Annual gross salary', c.annualGross],
    ['Income tax deducted', c.annualTax],
    ['Net paid', c.annualNet],
  ];
  for (const [label, val] of rows) {
    doc.fontSize(11).fillColor(DARK).text(label, 50, y).text(money(val, c.currency), 380, y, { width: 165, align: 'right' });
    y += 22;
  }
  y += 20;
  doc.fontSize(8).fillColor(GRAY).text(
    'System-generated statement of salary income and tax withheld. Figures are configurable and should be reconciled with statutory filings.',
    50,
    y,
    { width: 495 },
  );
  return toBuffer(doc);
}
