/**
 * Password-reset code delivery by e-mail (SMTP, nodemailer).
 *
 * Security finding S-04:
 *   - An OTP is never written to a log, the console or an error message.
 *     When SMTP is not configured the code simply cannot be delivered: the
 *     password-reset endpoints answer 503 OTP_DELIVERY_UNAVAILABLE before
 *     any code is generated (see passwordResetService). For local testing,
 *     point SMTP_* at a local mail catcher (e.g. Mailpit) instead.
 *   - Mobile (SMS) delivery has been removed: no SMS gateway has been
 *     approved, and the previous stub "delivered" codes by printing them to
 *     the server log. If a gateway (e.g. the NIC SMS gateway) is approved
 *     later, add a sender here and re-enable the "mobile" channel in
 *     passwordResetService.assertOtpDeliveryPossible.
 */

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { logger } from './logger.js';

const hasSmtp = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

if (!hasSmtp) {
  logger.warn('config.smtp_missing', {
    effect: 'password-reset codes cannot be sent; the reset endpoints answer 503 until SMTP_HOST/USER/PASS are set',
  });
}

/** Whether password-reset codes can be delivered at all on this server. */
export function isEmailDeliveryConfigured(): boolean {
  return hasSmtp;
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: (env.SMTP_PORT ?? 587) === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

function assertConfigured(): void {
  if (!hasSmtp) {
    // Callers check isEmailDeliveryConfigured() first; this is the backstop.
    // The message deliberately carries neither the recipient nor the code.
    throw new Error('E-mail delivery is not configured');
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  assertConfigured();
  await getTransporter().sendMail({
    from: env.SMTP_FROM ?? 'BUIDCO Portal <no-reply@buidco.in>',
    to,
    subject: 'Your BUIDCO Portal password reset code',
    text: `Your password reset code is ${otp}. It expires in 5 minutes. If you did not request this, you can ignore this email.`,
  });
}

/**
 * Delivers the OTP to an eligible approver instead of the requester — the
 * approver relays the code to the requester (out of band) after verifying
 * their identity. The OTP itself is the approval; there is no separate
 * approve/reject action anywhere in the system.
 */
export async function sendApprovalRequestEmail(
  to: string,
  requesterUsername: string,
  requesterRole: string,
  otp: string,
): Promise<void> {
  assertConfigured();
  await getTransporter().sendMail({
    from: env.SMTP_FROM ?? 'BUIDCO Portal <no-reply@buidco.in>',
    to,
    subject: 'BUIDCO Portal — password reset code for your approval',
    text: `${requesterUsername} (${requesterRole}) has requested a password reset. After verifying their identity, share this code with them: ${otp}. It expires in 5 minutes.`,
  });
}
