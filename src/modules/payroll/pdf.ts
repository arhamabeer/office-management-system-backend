import PDFDocument from 'pdfkit';
import type { PayslipDTO, TaxCertificateDTO, CompanyProfileDTO } from '@ems/types';
import { PDF, drawLetterhead, drawDocTitle, toBuffer } from '../../common/pdfBrand';

const ORANGE = PDF.orange;
const GRAY = PDF.gray;
const DARK = PDF.ink;

function money(n: number, cur: string): string {
  return `${cur} ${new Intl.NumberFormat('en-US').format(Math.round(n))}`;
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string, y: number): void {
  doc.fontSize(10).fillColor(GRAY).text(label, 50, y);
  doc.fillColor(DARK).text(value, 250, y);
}

export async function generatePayslipPdf(p: PayslipDTO, company: CompanyProfileDTO): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  let y = drawLetterhead(doc, company);
  y = drawDocTitle(doc, 'Payslip', y, p.month);

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

  doc.rect(50, y, 495, 30).fill(PDF.panel);
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

export async function generateCertificatePdf(c: TaxCertificateDTO, company: CompanyProfileDTO): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  let y = drawLetterhead(doc, company);
  y = drawDocTitle(doc, 'Tax Certificate', y, `Tax Year ${c.taxYearLabel}`);

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
