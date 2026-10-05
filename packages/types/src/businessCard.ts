/** Configurable company details shown on every employee business card. */
export interface CompanyProfileDTO {
  companyName: string;
  website?: string;
  address?: string;
  phone?: string;
  tagline?: string;
}

/** Everything needed to render an employee's digital business card in the portal. */
export interface BusinessCardDTO {
  employee: {
    fullName: string;
    initials: string;
    designation?: string;
    department?: string;
    email: string;
    phone?: string;
    employeeCode?: string;
  };
  company: CompanyProfileDTO;
  brand: { name: string; primaryColor: string; logo: string };
  /** PNG data URL of a QR code that loads the employee's contact card (vCard). */
  qrDataUrl: string;
}
