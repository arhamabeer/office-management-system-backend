import nodemailer, { type Transporter } from 'nodemailer';
import { env, isTest } from '../config/env';
import { logger } from './logger';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

let cached: Transporter | null | undefined;

/**
 * Resolve the mail transport once and cache it:
 * - `smtp` (or `auto` with SMTP_URL set): a real SMTP server — production path.
 * - `ethereal` (default in dev): a throwaway Ethereal inbox; each send logs a
 *   preview URL you can open to see the rendered email. No setup, no real send.
 * - `log`, or any failure: no transport — the message is logged instead, so
 *   onboarding never blocks on mail.
 */
async function getTransport(): Promise<Transporter | null> {
  if (cached !== undefined) return cached;
  if (isTest) return (cached = null); // never send during tests

  const hasSmtp = !!(env.SMTP_URL || env.SMTP_HOST);
  const mode = env.MAIL_TRANSPORT === 'auto' ? (hasSmtp ? 'smtp' : 'ethereal') : env.MAIL_TRANSPORT;

  if (mode === 'log') return (cached = null);

  if (mode === 'smtp') {
    if (env.SMTP_URL) {
      cached = nodemailer.createTransport(env.SMTP_URL);
    } else if (env.SMTP_HOST) {
      // Discrete settings (e.g. Brevo) — no URL-encoding of the login needed.
      cached = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE, // false for 587 (STARTTLS), true for 465
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      });
    } else {
      logger.warn('MAIL_TRANSPORT=smtp but no SMTP_URL/SMTP_HOST set — falling back to logging emails.');
      return (cached = null);
    }
    logger.info(`Mail: sending via SMTP (${env.SMTP_HOST || 'from SMTP_URL'}).`);
    return cached;
  }

  // ethereal
  try {
    const acct = await nodemailer.createTestAccount();
    cached = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: acct.user, pass: acct.pass },
    });
    logger.info(`Mail: using an Ethereal preview inbox (dev). Sent emails print a preview URL.`);
    return cached;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Mail: could not open an Ethereal inbox — logging emails instead.');
    return (cached = null);
  }
}

/**
 * Boot-time self-check: confirm the mail transport can connect + authenticate,
 * so a bad SMTP key is obvious in the logs immediately instead of only when the
 * first invite silently fails to send.
 */
export async function verifyMailTransport(): Promise<void> {
  const transport = await getTransport();
  if (!transport) {
    logger.info('mail: no SMTP transport configured — emails are logged only (set SMTP_URL/SMTP_HOST to send).');
    return;
  }
  try {
    await transport.verify();
    logger.info('mail: SMTP auth OK — invitations will be delivered.');
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      'mail: SMTP auth FAILED — check SMTP_USER/SMTP_PASS. Invitations will NOT be delivered.',
    );
  }
}

export async function sendMail(mail: Mail): Promise<void> {
  const transport = await getTransport();
  if (!transport) {
    // No transport: log the essentials so the link is still actionable in dev.
    logger.info({ to: mail.to, subject: mail.subject }, `[mail:log] ${mail.text}`);
    return;
  }
  try {
    const info = await transport.sendMail({ from: env.MAIL_FROM, ...mail });
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) logger.info(`[mail] Preview the email: ${preview}`);
    else logger.info({ to: mail.to, messageId: info.messageId }, '[mail] sent');
  } catch (err) {
    logger.error({ err: (err as Error).message, to: mail.to }, '[mail] send failed');
  }
}

/** Branded invitation / onboarding email. */
export function inviteEmail(opts: {
  to: string;
  name: string;
  inviteUrl: string;
  orgName: string;
  roleLabel: string;
  inviterName?: string;
}): Mail {
  const { to, name, inviteUrl, orgName, roleLabel, inviterName } = opts;
  const subject = `You're invited to join ${orgName}`;
  const intro = inviterName
    ? `${inviterName} has invited you to join <strong>${orgName}</strong>`
    : `You've been invited to join <strong>${orgName}</strong>`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="background:#FC6810;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 4px;font-size:20px;">Welcome to ${orgName}</h1>
            <p style="margin:0;color:#52525b;font-size:14px;">Employee Management System</p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#3f3f46;">
            <p style="margin:0 0 12px;">Hi ${name},</p>
            <p style="margin:0 0 12px;">${intro} as <strong>${roleLabel}</strong>. Set up your account to get started — it takes about a minute.</p>
            <p style="margin:24px 0;text-align:center;">
              <a href="${inviteUrl}" style="display:inline-block;background:#C2410C;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;font-size:15px;">Accept invitation</a>
            </p>
            <p style="margin:0 0 4px;color:#71717a;font-size:13px;">Or paste this link into your browser:</p>
            <p style="margin:0 0 16px;word-break:break-all;"><a href="${inviteUrl}" style="color:#C2410C;font-size:13px;">${inviteUrl}</a></p>
            <p style="margin:0;color:#a1a1aa;font-size:12px;">This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `Hi ${name},

${inviterName ? `${inviterName} has invited you` : "You've been invited"} to join ${orgName} as ${roleLabel}.

Set up your account here (expires in 7 days):
${inviteUrl}

If you weren't expecting this, you can ignore this email.`;
  return { to, subject, html, text };
}

export async function sendInviteEmail(opts: Parameters<typeof inviteEmail>[0]): Promise<void> {
  await sendMail(inviteEmail(opts));
}

/** Branded password-reset email. */
export function resetPasswordEmail(opts: {
  to: string;
  name: string;
  resetUrl: string;
  orgName: string;
}): Mail {
  const { to, name, resetUrl, orgName } = opts;
  const subject = `Reset your ${orgName} password`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="background:#FC6810;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 4px;font-size:20px;">Reset your password</h1>
            <p style="margin:0;color:#52525b;font-size:14px;">${orgName} — Employee Management System</p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#3f3f46;">
            <p style="margin:0 0 12px;">Hi ${name},</p>
            <p style="margin:0 0 12px;">We received a request to reset your password. Click below to choose a new one — the link is valid for 1 hour.</p>
            <p style="margin:24px 0;text-align:center;">
              <a href="${resetUrl}" style="display:inline-block;background:#C2410C;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;font-size:15px;">Reset password</a>
            </p>
            <p style="margin:0 0 4px;color:#71717a;font-size:13px;">Or paste this link into your browser:</p>
            <p style="margin:0 0 16px;word-break:break-all;"><a href="${resetUrl}" style="color:#C2410C;font-size:13px;">${resetUrl}</a></p>
            <p style="margin:0;color:#a1a1aa;font-size:12px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `Hi ${name},

We received a request to reset your password. Open this link to choose a new one (valid for 1 hour):
${resetUrl}

If you didn't request this, you can ignore this email.`;
  return { to, subject, html, text };
}

export async function sendResetEmail(opts: Parameters<typeof resetPasswordEmail>[0]): Promise<void> {
  await sendMail(resetPasswordEmail(opts));
}

/** Generic branded notification email (approvals, decisions, …). */
export function notificationEmail(opts: {
  to: string;
  name: string;
  title: string;
  body: string;
  orgName: string;
  actionUrl?: string;
  actionLabel?: string;
}): Mail {
  const { to, name, title, body, orgName, actionUrl, actionLabel } = opts;
  const button = actionUrl
    ? `<p style="margin:24px 0;text-align:center;">
         <a href="${actionUrl}" style="display:inline-block;background:#C2410C;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;font-size:15px;">${actionLabel ?? 'Open'}</a>
       </p>`
    : '';
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="background:#FC6810;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 4px;font-size:20px;">${title}</h1>
            <p style="margin:0;color:#52525b;font-size:14px;">${orgName} — Employee Management System</p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#3f3f46;">
            <p style="margin:0 0 12px;">Hi ${name},</p>
            <p style="margin:0 0 12px;">${body}</p>
            ${button}
            <p style="margin:0;color:#a1a1aa;font-size:12px;">You can turn these emails off under your profile — in-app notifications stay on.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `Hi ${name},

${body}
${actionUrl ? `\n${actionLabel ?? 'Open'}: ${actionUrl}\n` : ''}
— ${orgName}`;
  return { to, subject: title, html, text };
}

export async function sendNotificationEmail(opts: Parameters<typeof notificationEmail>[0]): Promise<void> {
  await sendMail(notificationEmail(opts));
}

/** Branded cover email that carries a letter PDF as an attachment. */
export function letterEmail(opts: {
  to: string;
  recipientName?: string;
  subject: string;
  orgName: string;
  senderName?: string;
  pdf: MailAttachment;
}): Mail {
  const { to, recipientName, subject, orgName, senderName, pdf } = opts;
  const greeting = recipientName ? `Dear ${recipientName},` : 'Hello,';
  const intro = `Please find attached a letter from ${orgName}${senderName ? `, sent by ${senderName}` : ''}.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="background:#FC6810;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 4px;font-size:20px;">${subject}</h1>
            <p style="margin:0;color:#52525b;font-size:14px;">${orgName}</p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#3f3f46;">
            <p style="margin:0 0 12px;">${greeting}</p>
            <p style="margin:0 0 12px;">${intro} The letter is attached as a PDF.</p>
            <p style="margin:0;color:#a1a1aa;font-size:12px;">If you weren't expecting this, you can ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = `${greeting}

${intro} The letter is attached as a PDF.

— ${orgName}`;
  return { to, subject, html, text, attachments: [pdf] };
}

export async function sendLetterEmail(opts: Parameters<typeof letterEmail>[0]): Promise<void> {
  await sendMail(letterEmail(opts));
}

/** Branded "marked absent" notice. Sent to the employee, and (as a manager
 *  copy) to their manager/lead when the auto-absent sweep runs. */
export function absenceEmail(opts: {
  to: string;
  name: string;
  date: string;
  orgName: string;
  cutoff: string;
  /** When set, this is the copy for a manager about `employeeName`. */
  managerCopyFor?: string;
}): Mail {
  const { to, name, date, orgName, cutoff, managerCopyFor } = opts;
  const subject = managerCopyFor
    ? `${managerCopyFor} was marked absent on ${date}`
    : `You were marked absent on ${date}`;
  const body = managerCopyFor
    ? `<strong>${managerCopyFor}</strong> had not checked in by ${cutoff} on <strong>${date}</strong>, so they were automatically marked <strong>absent</strong> for the day. If they check in later, their status will update automatically.`
    : `You had not checked in by ${cutoff} on <strong>${date}</strong>, so you were automatically marked <strong>absent</strong> for the day. If you check in later today, your status will update automatically. If this is a mistake, please check in or raise a correction request.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr><td style="background:#FC6810;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 32px 8px;">
            <h1 style="margin:0 0 4px;font-size:20px;">Attendance notice</h1>
            <p style="margin:0;color:#52525b;font-size:14px;">${orgName} — Employee Management System</p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:15px;line-height:1.6;color:#3f3f46;">
            <p style="margin:0 0 12px;">Hi ${name},</p>
            <p style="margin:0 0 12px;">${body}</p>
            <p style="margin:0;color:#a1a1aa;font-size:12px;">This is an automated message from ${orgName}.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = managerCopyFor
    ? `Hi ${name},\n\n${managerCopyFor} had not checked in by ${cutoff} on ${date}, so they were automatically marked absent. If they check in later, their status will update automatically.\n\n— ${orgName}`
    : `Hi ${name},\n\nYou had not checked in by ${cutoff} on ${date}, so you were automatically marked absent for the day. If you check in later today, your status will update automatically.\n\n— ${orgName}`;
  return { to, subject, html, text };
}

export async function sendAbsenceEmail(opts: Parameters<typeof absenceEmail>[0]): Promise<void> {
  await sendMail(absenceEmail(opts));
}
