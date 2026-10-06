import { Types } from 'mongoose';
import PDFDocument from 'pdfkit';
import type { LetterTemplateDTO, CompanyProfileDTO } from '@ems/types';
import type {
  LetterTemplateInput,
  UpdateLetterTemplateInput,
  RenderLetterInput,
  EmailLetterInput,
} from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { LetterTemplate, type LetterTemplateDoc } from './letterTemplate.model';
import { getCompanyProfile } from '../businessCard/businessCard.service';
import { PDF, drawLetterhead, toBuffer } from '../../common/pdfBrand';
import { sendLetterEmail } from '../../common/mailer';
import { recordAudit } from '../../middleware/audit';
import { NotFoundError } from '../../common/errors';

// ---------------------------------------------------------------- templates

function toDTO(t: LetterTemplateDoc): LetterTemplateDTO {
  return {
    id: String(t._id),
    title: t.title,
    subject: t.subject,
    salutation: t.salutation ?? undefined,
    body: t.body,
    signatoryName: t.signatoryName ?? undefined,
    signatoryTitle: t.signatoryTitle ?? undefined,
    createdById: t.createdById ? String(t.createdById) : undefined,
    createdAt: (t.createdAt as Date).toISOString(),
    updatedAt: (t.updatedAt as Date).toISOString(),
  };
}

export async function listTemplates(): Promise<LetterTemplateDTO[]> {
  const docs = await LetterTemplate.find().sort({ title: 1, updatedAt: -1 });
  return docs.map(toDTO);
}

export async function getTemplate(id: string): Promise<LetterTemplateDTO> {
  const doc = await LetterTemplate.findById(id);
  if (!doc) throw new NotFoundError('Letter template not found');
  return toDTO(doc);
}

export async function createTemplate(actor: AuthUser, input: LetterTemplateInput): Promise<LetterTemplateDTO> {
  const doc = await LetterTemplate.create({ ...input, createdById: new Types.ObjectId(actor.id) });
  await recordAudit({ action: 'letter_template.created', actorId: actor.id, actorLabel: actor.email, targetType: 'LetterTemplate', targetId: String(doc._id), meta: { title: doc.title } });
  return toDTO(doc);
}

export async function updateTemplate(actor: AuthUser, id: string, input: UpdateLetterTemplateInput): Promise<LetterTemplateDTO> {
  const doc = await LetterTemplate.findById(id);
  if (!doc) throw new NotFoundError('Letter template not found');
  Object.assign(doc, input);
  await doc.save();
  await recordAudit({ action: 'letter_template.updated', actorId: actor.id, actorLabel: actor.email, targetType: 'LetterTemplate', targetId: id });
  return toDTO(doc);
}

export async function deleteTemplate(actor: AuthUser, id: string): Promise<void> {
  const doc = await LetterTemplate.findByIdAndDelete(id);
  if (!doc) throw new NotFoundError('Letter template not found');
  await recordAudit({ action: 'letter_template.deleted', actorId: actor.id, actorLabel: actor.email, targetType: 'LetterTemplate', targetId: id, meta: { title: doc.title } });
}

// ---------------------------------------------------------------- PDF

function buildLetterPdf(letter: RenderLetterInput, company: CompanyProfileDTO): Promise<Buffer> {
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

function fileName(title: string): string {
  const safe = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'letter';
  return `${safe}.pdf`;
}

export async function renderLetter(actor: AuthUser, input: RenderLetterInput): Promise<{ buffer: Buffer; filename: string }> {
  const company = await getCompanyProfile();
  await recordAudit({ action: 'letter.download', actorId: actor.id, actorLabel: actor.email, meta: { subject: input.subject } });
  return { buffer: await buildLetterPdf(input, company), filename: fileName(input.title) };
}

export async function emailLetter(actor: AuthUser, input: EmailLetterInput): Promise<{ success: true }> {
  const company = await getCompanyProfile();
  const buffer = await buildLetterPdf(input, company);
  await sendLetterEmail({
    to: input.recipientEmail,
    recipientName: input.recipientName,
    subject: input.subject,
    orgName: company.companyName,
    pdf: { filename: fileName(input.title), content: buffer, contentType: 'application/pdf' },
  });
  await recordAudit({ action: 'letter.emailed', actorId: actor.id, actorLabel: actor.email, meta: { to: input.recipientEmail, subject: input.subject } });
  return { success: true };
}
