import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { BRAND } from '@ems/config';
import type { BusinessCardDTO, CompanyProfileDTO } from '@ems/types';
import type { UpdateCompanyProfileInput } from '@ems/validation';
import type { AuthUser } from '../../middleware/auth';
import { CompanyProfile, type CompanyProfileDoc } from './companyProfile.model';
import { User } from '../auth/user.model';
import { EmployeeProfile } from '../employees/employeeProfile.model';
import { Department } from '../departments/department.model';
import { recordAudit } from '../../middleware/audit';
import { NotFoundError } from '../../common/errors';

const ORANGE = BRAND.colors.orange;
const STRONG = '#C2410C'; // legible accent for TEXT — bright orange fails WCAG on white
const GRAY = '#64748b';
const INK = '#0f172a';
const HAIR = '#E5E7EB';

// ---------------------------------------------------------------- company config

function companyDTO(c: CompanyProfileDoc): CompanyProfileDTO {
  return {
    companyName: c.companyName || BRAND.name,
    website: c.website ?? undefined,
    address: c.address ?? undefined,
    phone: c.phone ?? undefined,
    tagline: c.tagline ?? undefined,
  };
}

export async function getCompanyProfileDoc(): Promise<CompanyProfileDoc> {
  const existing = await CompanyProfile.findOne({ key: 'default' });
  if (existing) return existing;
  try {
    await CompanyProfile.create({ key: 'default', companyName: BRAND.name });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return (await CompanyProfile.findOne({ key: 'default' }))!;
}

export async function getCompanyProfile(): Promise<CompanyProfileDTO> {
  return companyDTO(await getCompanyProfileDoc());
}

export async function updateCompanyProfile(actor: AuthUser, input: UpdateCompanyProfileInput): Promise<CompanyProfileDTO> {
  const c = await getCompanyProfileDoc();
  Object.assign(c, input);
  await c.save();
  await recordAudit({ action: 'company.profile_updated', actorId: actor.id, actorLabel: actor.email });
  return companyDTO(c);
}

// ---------------------------------------------------------------- card assembly

interface CardEmployee {
  fullName: string;
  initials: string;
  designation?: string;
  department?: string;
  email: string;
  phone?: string;
  employeeCode?: string;
}

async function cardFor(actor: AuthUser): Promise<{ employee: CardEmployee; company: CompanyProfileDTO }> {
  const user = await User.findById(actor.id).select('email');
  if (!user) throw new NotFoundError('User not found');
  const prof = await EmployeeProfile.findOne({ userId: actor.id });
  const dept = prof?.departmentId ? await Department.findById(prof.departmentId).select('name') : null;
  const first = prof?.firstName ?? '';
  const last = prof?.lastName ?? '';
  const fullName = `${first} ${last}`.trim() || user.email;
  const initials = ((first[0] ?? '') + (last[0] ?? '')).toUpperCase() || (user.email[0] ?? '?').toUpperCase();
  const employee: CardEmployee = {
    fullName,
    initials,
    designation: prof?.designation ?? undefined,
    department: dept?.name ?? undefined,
    email: user.email,
    phone: prof?.phone ?? undefined,
    employeeCode: prof?.employeeCode ?? undefined,
  };
  return { employee, company: companyDTO(await getCompanyProfileDoc()) };
}

/** Standard vCard 3.0 so a scan/open adds the contact to a phone. */
function buildVCard(e: CardEmployee, company: CompanyProfileDTO): string {
  const [first, ...rest] = e.fullName.split(' ');
  const last = rest.join(' ');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${last};${first};;;`,
    `FN:${e.fullName}`,
    `ORG:${company.companyName}`,
    e.designation ? `TITLE:${e.designation}` : '',
    `EMAIL;type=WORK:${e.email}`,
    e.phone ? `TEL;type=CELL,voice:${e.phone}` : '',
    company.phone ? `TEL;type=WORK,voice:${company.phone}` : '',
    company.website ? `URL:${company.website}` : '',
    company.address ? `ADR;type=WORK:;;${company.address};;;;` : '',
    company.tagline ? `NOTE:${company.tagline}` : '',
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export async function getMyCard(actor: AuthUser): Promise<BusinessCardDTO> {
  const { employee, company } = await cardFor(actor);
  const vcard = buildVCard(employee, company);
  const qrDataUrl = await QRCode.toDataURL(vcard, { margin: 1, width: 240, color: { dark: INK, light: '#ffffff' } });
  return {
    employee,
    company,
    brand: { name: BRAND.name, primaryColor: ORANGE, logo: BRAND.logo.horizontal },
    qrDataUrl,
  };
}

export async function getVCard(actor: AuthUser): Promise<{ vcard: string; filename: string }> {
  const { employee, company } = await cardFor(actor);
  const safe = employee.fullName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'contact';
  return { vcard: buildVCard(employee, company), filename: `${safe}.vcf` };
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

export async function getCardPdf(actor: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
  const { employee, company } = await cardFor(actor);
  const vcard = buildVCard(employee, company);
  const qrPng = await QRCode.toBuffer(vcard, { margin: 1, width: 220, color: { dark: INK, light: '#ffffff' } });

  const W = 520;
  const H = 300;
  const PAD = 40;
  const COL = 300; // left text column — leaves a clear rail for the QR
  const doc = new PDFDocument({ size: [W, H], margin: 0 });

  // Flat white card with a single orange spine — no filled header band.
  doc.rect(0, 0, W, H).fill('#ffffff');
  doc.rect(0, 0, 5, H).fill(ORANGE);

  // Company wordmark at the top (stands in for the logo).
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(company.companyName.toUpperCase(), PAD, 34, { characterSpacing: 0.8, width: COL });

  // Name (hero) → role (accent) → department, tightly grouped.
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(24).text(employee.fullName, PAD, 84, { width: COL });
  let y = doc.y + 6;
  if (employee.designation) {
    doc.fillColor(STRONG).font('Helvetica-Bold').fontSize(12).text(employee.designation, PAD, y, { width: COL });
    y = doc.y + 2;
  }
  if (employee.department) {
    doc.fillColor(GRAY).font('Helvetica').fontSize(10.5).text(employee.department, PAD, y, { width: COL });
    y = doc.y;
  }

  // Hairline divider.
  y += 14;
  doc.lineWidth(1).moveTo(PAD, y).lineTo(PAD + COL - 40, y).stroke(HAIR);

  // Contact — clean value-only lines (no label column).
  y += 18;
  doc.font('Helvetica').fontSize(11).fillColor('#334155').text(employee.email, PAD, y, { width: COL });
  const phone = employee.phone ?? company.phone;
  if (phone) doc.text(phone, PAD, doc.y + 6, { width: COL });

  // Quiet colophon pinned near the bottom.
  const colophon = [company.website, company.address].filter(Boolean).join('   ·   ');
  if (colophon) doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(colophon, PAD, H - 30, { width: COL });

  // QR seated in a bordered panel on the right, vertically centred.
  const qrSize = 112;
  const panel = qrSize + 18;
  const px = W - 36 - panel;
  const py = (H - panel - 20) / 2;
  doc.roundedRect(px, py, panel, panel, 10).lineWidth(1).fillAndStroke('#ffffff', HAIR);
  doc.image(qrPng, px + 9, py + 9, { width: qrSize, height: qrSize });
  doc
    .fillColor(GRAY)
    .font('Helvetica-Bold')
    .fontSize(7)
    .text('SCAN TO SAVE CONTACT', px, py + panel + 8, { width: panel, align: 'center', characterSpacing: 1 });

  const buffer = await toBuffer(doc);
  const safe = employee.fullName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'card';
  return { buffer, filename: `${safe}-business-card.pdf` };
}
