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
import { drawLogo, toBuffer } from '../../common/pdfBrand';

const ORANGE = BRAND.colors.orange; // #FC6810
const INK = '#0f172a';

// ---------------------------------------------------------------- company config

function companyDTO(c: CompanyProfileDoc): CompanyProfileDTO {
  return {
    companyName: c.companyName || BRAND.name,
    website: c.website ?? undefined,
    email: c.email ?? undefined,
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

const stripProto = (u?: string): string => (u ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');

/**
 * Two-sided business card matching the BrainCrop template:
 *  FRONT — white, logo on the left, employee + company details on the right as a
 *          label:value contact block, with a thin orange bar down the right edge.
 *  BACK  — solid brand orange.
 */
export async function getCardPdf(actor: AuthUser): Promise<{ buffer: Buffer; filename: string }> {
  const { employee, company } = await cardFor(actor);

  // Scan-to-save-contact QR (vCard), drawn on the white front field.
  const qrBuf = await QRCode.toBuffer(buildVCard(employee, company), {
    margin: 1,
    width: 300,
    color: { dark: INK, light: '#ffffff' },
  });

  // 3.5" x 2" business card, scaled up for a crisp on-screen/print rendering.
  const W = 525;
  const H = 300;
  const PAD = 34;
  const BAR = 9; // orange right-edge rail

  const NAME = '#4B4B4B';
  const TITLE = '#7C7C7C';
  const BODY = '#6B7280';
  const LABEL = '#9AA0A6';

  const doc = new PDFDocument({ size: [W, H], margin: 0 });

  // ---- FRONT ----
  doc.rect(0, 0, W, H).fill('#ffffff');
  doc.rect(W - BAR, 0, BAR, H).fill(ORANGE);

  // Logo at the top-left, aligned with the name (per the brand template).
  const logoW = 188;
  drawLogo(doc, PAD, 42, logoW);

  // Scan-to-save QR in the lower-left; the surrounding white is its quiet zone.
  const qrSize = 86;
  const qrY = 150;
  doc.image(qrBuf, PAD, qrY, { width: qrSize, height: qrSize });

  // Right column.
  const RX = 250;
  const RW = W - RX - PAD - BAR;
  let y = 44;

  // Name and title are each capped to a single (ellipsised) line so the right
  // column has a bounded height and never pushes the contact rows off the card.
  doc.font('Helvetica-Bold').fontSize(22).fillColor(NAME).text(employee.fullName.toUpperCase(), RX, y, { width: RW, height: 26, ellipsis: true });
  y = doc.y + 3;
  if (employee.designation) {
    doc.font('Helvetica').fontSize(12).fillColor(TITLE).text(employee.designation, RX, y, { width: RW, height: 15, ellipsis: true });
    y = doc.y;
  }

  // Address block (one line per comma segment, capped at 5 lines so a long
  // address can't overflow — any extra segments fold onto the last line).
  if (company.address) {
    y += 14;
    const segs = company.address.split(',').map((s) => s.trim()).filter(Boolean);
    const lines = segs.length <= 5 ? segs : [...segs.slice(0, 4), segs.slice(4).join(', ')];
    doc.font('Helvetica').fontSize(10).fillColor(BODY);
    for (const ln of lines) {
      doc.text(ln, RX, y, { width: RW, height: 13, ellipsis: true });
      y = doc.y + 1;
    }
  }

  // Contact block: aligned "Label : value" rows.
  const rows: [string, string][] = [];
  if (company.phone) rows.push(['Phone', company.phone]);
  if (employee.phone) rows.push(['Mobile', employee.phone]);
  rows.push(['Email', employee.email]);
  if (company.website) rows.push(['Web', stripProto(company.website)]);

  y += 14;
  const labelW = 46;
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(10).fillColor(LABEL).text(label, RX, y, { width: labelW });
    doc.fillColor(LABEL).text(':', RX + labelW, y, { width: 8 });
    doc.fillColor(BODY).text(value, RX + labelW + 12, y, { width: RW - labelW - 12 });
    y = doc.y + 3;
  }

  // ---- BACK: solid orange with the company wordmark, tagline + contact ----
  doc.addPage({ size: [W, H], margin: 0 });
  doc.rect(0, 0, W, H).fill(ORANGE);

  doc
    .font('Helvetica-Bold')
    .fontSize(30)
    .fillColor('#ffffff')
    .text(company.companyName, 0, 80, { width: W, align: 'center', characterSpacing: 1 });
  let by = doc.y + 8;
  if (company.tagline) {
    doc.font('Helvetica-Oblique').fontSize(12).fillColor('#ffe3d1').text(company.tagline, 60, by, { width: W - 120, align: 'center' });
    by = doc.y;
  }
  by += 26;
  const backLines = [stripProto(company.website), company.email, company.phone, company.address].filter(Boolean) as string[];
  doc.font('Helvetica').fontSize(10).fillColor('#ffffff');
  for (const ln of backLines) {
    doc.text(ln, 44, by, { width: W - 88, align: 'center' });
    by = doc.y + 5;
  }

  const buffer = await toBuffer(doc);
  const safe = employee.fullName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'card';
  return { buffer, filename: `${safe}-business-card.pdf` };
}
