/**
 * A reusable letter TEMPLATE, composed by an Owner/Admin and rendered on the
 * company letterhead. Templates are generic — they carry no recipient and no
 * date. An admin opens a template, fills in a recipient + date, then downloads
 * or emails the resulting PDF (the filled letter itself is not stored).
 */
export interface LetterTemplateDTO {
  id: string;
  /** Internal label for the list (e.g. "Experience Letter"). */
  title: string;
  subject: string;
  salutation?: string;
  /** Letter body. Blank lines separate paragraphs. May contain [placeholders]. */
  body: string;
  signatoryName?: string;
  signatoryTitle?: string;
  createdById?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A rendered/emailed letter — a template's content filled in for one recipient.
 * Sent to POST /letters/render (download) or POST /letters/email (send). Never
 * persisted.
 */
export interface RenderLetterDTO {
  /** Used only for the download filename. */
  title: string;
  reference?: string;
  /** Free-text date as it should print (e.g. "6 October 2026"). */
  letterDate?: string;
  recipientName?: string;
  /** Recipient address block — one entry per line. */
  recipientLines?: string;
  /** Delivery address when emailing. */
  recipientEmail?: string;
  salutation?: string;
  subject: string;
  body: string;
  signatoryName?: string;
  signatoryTitle?: string;
}
