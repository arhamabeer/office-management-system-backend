import fs from 'node:fs';
import path from 'node:path';
import type { CompanyProfileDTO } from '@ems/types';

/**
 * Shared PDF branding: the BrainCrop letterhead (logo + company address +
 * contact line + orange rule) used at the top of every generated document, and
 * the brand colours + helpers. The business card has its own layout (see
 * businessCard.service.ts) but reuses these colours and the logo buffer.
 */

export const PDF = {
  orange: '#FC6810', // brand orange (leaves + "CROP")
  brandGray: '#808285', // the logo's gray (head + "BRAIN")
  ink: '#1F2937',
  gray: '#6B7280',
  mute: '#9CA3AF',
  hair: '#E5E7EB',
  panel: '#F1F3F5',
} as const;

const LOGO_ASPECT = 252 / 1024; // h / w of braincrop-logo.png

// Load the logo once at startup; if it's missing, letterheads fall back to a
// text wordmark so document generation never crashes.
const LOGO_PATH = path.join(process.cwd(), 'assets', 'brand', 'braincrop-logo.png');
let LOGO: Buffer | null = null;
try {
  LOGO = fs.readFileSync(LOGO_PATH);
} catch {
  LOGO = null;
}
export const brandLogo: Buffer | null = LOGO;

export function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function stripProtocol(url?: string): string {
  return (url ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/** Draw the horizontal logo lockup at (x, y) with the given width; returns its
 *  drawn height. Falls back to a "BRAIN CROP" wordmark if the asset is missing. */
export function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, width: number): number {
  if (LOGO) {
    doc.image(LOGO, x, y, { width });
    return width * LOGO_ASPECT;
  }
  const size = Math.max(10, width * 0.16);
  doc
    .font('Helvetica-Bold')
    .fontSize(size)
    .fillColor(PDF.brandGray)
    .text('BRAIN', x, y, { continued: true })
    .fillColor(PDF.orange)
    .text('CROP');
  return size * 1.2;
}

/**
 * Centred company letterhead at the top of a document: logo, address line,
 * contact line (email | website), and an orange rule. Returns the Y coordinate
 * where the document body should begin.
 */
export function drawLetterhead(doc: PDFKit.PDFDocument, company: CompanyProfileDTO): number {
  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const contentW = pageW - left - doc.page.margins.right;
  const top = 42;

  const logoW = 150;
  const logoH = drawLogo(doc, (pageW - logoW) / 2, top, logoW);
  let y = top + logoH + 10;

  if (company.address) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(PDF.gray)
      .text(company.address, left, y, { width: contentW, align: 'center' });
    y = doc.y + 2;
  }

  const contact = [company.email, stripProtocol(company.website)].filter(Boolean).join('   |   ');
  if (contact) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(PDF.orange)
      .text(contact, left, y, { width: contentW, align: 'center' });
    y = doc.y;
  }

  y += 10;
  doc.moveTo(left, y).lineTo(pageW - doc.page.margins.right, y).lineWidth(1.2).strokeColor(PDF.orange).stroke();
  return y + 20;
}

/** A small centred title under the letterhead (document name + optional subtitle). */
export function drawDocTitle(doc: PDFKit.PDFDocument, title: string, y: number, subtitle?: string): number {
  const left = doc.page.margins.left;
  const contentW = doc.page.width - left - doc.page.margins.right;
  doc.font('Helvetica-Bold').fontSize(15).fillColor(PDF.ink).text(title, left, y, { width: contentW, align: 'center' });
  let out = doc.y;
  if (subtitle) {
    doc.font('Helvetica').fontSize(10).fillColor(PDF.gray).text(subtitle, left, out + 2, { width: contentW, align: 'center' });
    out = doc.y;
  }
  return out + 16;
}
