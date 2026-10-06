/** A letter composed by an Owner/Admin, rendered on the company letterhead. */
export interface LetterDTO {
  id: string;
  /** Internal label for the list (e.g. "Experience Letter — Wasif Aleem"). */
  title: string;
  reference?: string;
  /** Free-text date as it should print (e.g. "6 October 2026"). */
  letterDate?: string;
  recipientName?: string;
  /** Recipient address block — one entry per line. */
  recipientLines?: string;
  salutation?: string;
  subject: string;
  /** Letter body. Blank lines separate paragraphs. */
  body: string;
  signatoryName?: string;
  signatoryTitle?: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
}
