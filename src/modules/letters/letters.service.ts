import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import type { LetterDTO, CompanyProfileDTO } from '@ems/types';
import type { LetterInput, UpdateLetterInput } from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { Letter, type LetterDoc } from './letter.model';
import { getCompanyProfile } from '../businessCard/businessCard.service';
import { PDF, drawLetterhead, toBuffer } from '../../common/pdfBrand';
import { recordAudit } from '../../middleware/audit';
import { NotFoundError } from '../../common/errors';

function toDTO(l: LetterDoc): LetterDTO {
  return {
    id: String(l._id),
    title: l.title,
    reference: l.reference ?? undefined,
    letterDate: l.letterDate ?? undefined,
    recipientName: l.recipientName ?? undefined,
    recipientLines: l.recipientLines ?? undefined,
    salutation: l.salutation ?? undefined,
    subject: l.subject,
    body: l.body,
    signatoryName: l.signatoryName ?? undefined,
    signatoryTitle: l.signatoryTitle ?? undefined,
    createdById: l.createdById ? String(l.createdById) : undefined,
    createdAt: (l.createdAt as Date).toISOString(),
    updatedAt: (l.updatedAt as Date).toISOString(),
  };
}

export async function listLetters(): Promise<LetterDTO[]> {
  const docs = await Letter.find().sort({ updatedAt: -1 });
  return docs.map(toDTO);
}

export async function getLetter(id: string): Promise<LetterDTO> {
  const doc = await Letter.findById(id);
  if (!doc) throw new NotFoundError('Letter not found');
  return toDTO(doc);
}

export async function createLetter(actor: AuthUser, input: LetterInput): Promise<LetterDTO> {
  const doc = await Letter.create({ ...input, createdById: new Types.ObjectId(actor.id) });
  await recordAudit({ action: 'letter.created', actorId: actor.id, actorLabel: actor.email, targetType: 'Letter', targetId: String(doc._id), meta: { title: doc.title } });
  return toDTO(doc);
}

export async function updateLetter(actor: AuthUser, id: string, input: UpdateLetterInput): Promise<LetterDTO> {
  const doc = await Letter.findById(id);
  if (!doc) throw new NotFoundError('Letter not found');
  Object.assign(doc, input);
  await doc.save();
  await recordAudit({ action: 'letter.updated', actorId: actor.id, actorLabel: actor.email, targetType: 'Letter', targetId: id });
  return toDTO(doc);
}

export async function deleteLetter(actor: AuthUser, id: string): Promise<void> {
  const doc = await Letter.findByIdAndDelete(id);
  if (!doc) throw new NotFoundError('Letter not found');
  await recordAudit({ action: 'letter.deleted', actorId: actor.id, actorLabel: actor.email, targetType: 'Letter', targetId: id, meta: { title: doc.title } });
}

// ---------------------------------------------------------------- PDF

function buildLetterPdf(letter: LetterDTO, company: CompanyProfileDTO): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const left = doc.page.margins.left;
  const contentW = doc.page.width - left - doc.page.margins.right;
  let y = drawLetterhead(doc, company);
  y += 6;

  // Reference (left) + date (right)
  if (letter.reference || letter.letterDate) {
    doc.font('Helvetica').fontSize(10).fillColor(PDF.gray);
    if (letter.reference) doc.text(`Ref: ${letter.reference}`, left, y, { continued: false });
    if (letter.letterDate) doc.text(letter.letterDate, left, y, { width: contentW, align: 'right' });
    y = doc.y + 16;
  }

  // Recipient block
  if (letter.recipientName || letter.recipientLines) {
    if (letter.recipientName) {
      doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF.ink).text(letter.recipientName, left, y, { width: contentW });
      y = doc.y;
    }
    if (letter.recipientLines) {
      doc.font('Helvetica').fontSize(10).fillColor(PDF.gray);
      for (const ln of letter.recipientLines.split('\n').map((s) => s.trim()).filter(Boolean)) {
        doc.text(ln, left, y + 2, { width: contentW * 0.6 });
        y = doc.y;
      }
    }
    y += 18;
  }

  // Subject (bold + underlined, like the template)
  doc.font('Helvetica-Bold').fontSize(12).fillColor(PDF.ink).text(`Subject: ${letter.subject}`, left, y, { width: contentW, underline: true });
  y = doc.y + 16;

  // Salutation
  if (letter.salutation) {
    doc.font('Helvetica').fontSize(11).fillColor(PDF.ink).text(letter.salutation, left, y, { width: contentW });
    y = doc.y + 10;
  }

  // Body — blank lines separate paragraphs
  doc.font('Helvetica').fontSize(11).fillColor('#374151');
  for (const para of letter.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)) {
    if (y > 760) {
      doc.addPage();
      y = 50;
    }
    doc.text(para, left, y, { width: contentW, align: 'left', lineGap: 3 });
    y = doc.y + 10;
  }

  // Sign-off
  y += 18;
  if (y > 740) {
    doc.addPage();
    y = 50;
  }
  doc.font('Helvetica').fontSize(11).fillColor(PDF.ink).text('Yours sincerely,', left, y);
  y = doc.y + 30;
  if (letter.signatoryName) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF.ink).text(letter.signatoryName, left, y);
    y = doc.y;
  }
  if (letter.signatoryTitle) {
    doc.font('Helvetica').fontSize(10).fillColor(PDF.gray).text(letter.signatoryTitle, left, y + 1);
    y = doc.y;
  }
  doc.font('Helvetica').fontSize(10).fillColor(PDF.gray).text(company.companyName, left, y + 1);

  return toBuffer(doc);
}

export async function getLetterPdf(actor: AuthUser, id: string): Promise<{ buffer: Buffer; filename: string }> {
  const letter = await getLetter(id);
  const company = await getCompanyProfile();
  await recordAudit({ action: 'letter.download', actorId: actor.id, actorLabel: actor.email, targetType: 'Letter', targetId: id });
  const safe = letter.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'letter';
  return { buffer: await buildLetterPdf(letter, company), filename: `${safe}.pdf` };
}
