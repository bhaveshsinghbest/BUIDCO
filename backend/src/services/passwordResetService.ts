import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Request } from 'express';
import { db } from '../db/client.js';
import type { UserRole } from '../db/enums.js';
import { appUser, passwordResetOtp, refreshToken } from '../db/schema.js';
import { recordAudit } from '../lib/audit.js';
import { diffAppUser } from '../lib/auditLabels.js';
import { logger } from '../lib/logger.js';
import { isEmailDeliveryConfigured, sendApprovalRequestEmail, sendOtpEmail } from '../lib/mailer.js';
import {
  generateOtp,
  hashOtp,
  maskEmail,
  parseResetToken,
  signResetToken,
  verifyOtp as compareOtp,
  verifyResetToken,
} from '../lib/otp.js';
import { hashPassword } from '../lib/passwords.js';
import { approverRolesLabel } from '../lib/roleHierarchy.js';
import { HttpError } from '../middleware/errorHandler.js';
import * as requestService from './passwordResetRequestService.js';

export type OtpChannel = 'email' | 'mobile';

const OTP_TTL_MS = 5 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

/** Same generic message for every "code didn't work" case — don't help an attacker distinguish wrong-code from no-such-user/no-such-OTP. */
const INVALID_OTP_MESSAGE = 'Invalid or expired code';
const INVALID_RESET_TOKEN_MESSAGE = 'Invalid or expired reset link. Please start the process again.';

function requestFingerprint(req: Request): { userAgent: string | null; ip: string | null } {
  return { userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null };
}

/**
 * Refuses a reset-code request that cannot be delivered (finding S-04):
 *   - "mobile": no SMS gateway is approved, so the channel is withdrawn;
 *   - no SMTP: nothing can be sent at all.
 * Checked before any user lookup, so the answer is the same for every
 * username and reveals nothing about accounts.
 */
export function assertOtpDeliveryPossible(channel: OtpChannel): void {
  if (channel !== 'email') {
    throw new HttpError(
      400,
      'CHANNEL_UNAVAILABLE',
      'Codes can only be sent by e-mail. Mobile (SMS) delivery is not available.',
    );
  }
  if (!isEmailDeliveryConfigured()) {
    throw new HttpError(
      503,
      'OTP_DELIVERY_UNAVAILABLE',
      'Password reset by e-mail is not available on this server. Please contact your administrator.',
    );
  }
}

export interface RequestPasswordResetResult {
  found: boolean;
  /** Only MD self-serves directly; every other role goes through the request/approval workflow. */
  selfService: boolean;
  /** E-mail is the only delivery channel; the mobile number is no longer disclosed (S-04). */
  maskedEmail: string | null;
  /** Present only when found && !selfService — drives the non-MD Forgot Password UI state. */
  requestStatus?: 'none' | 'pending' | 'approved';
  /** Present only when requestStatus === 'approved' — the channel fixed at request-submission time. */
  channel?: OtpChannel;
  /** Present only when found && !selfService — e.g. "MD, Admin, or PD". */
  approverRolesLabel?: string;
}

/**
 * Looks up the user but always returns a uniformly-shaped result — the
 * caller (route) responds 200 either way. `found: false` carries no
 * masked contact info, so the UI simply doesn't progress to the method
 * picker; there's no distinct error status/shape an attacker could use
 * to enumerate valid usernames (Task 10).
 */
export async function requestPasswordReset(username: string): Promise<RequestPasswordResetResult> {
  const [user] = await db.select().from(appUser).where(eq(appUser.username, username)).limit(1);
  if (!user || !user.isActive) {
    return { found: false, selfService: false, maskedEmail: null };
  }

  const role = user.role as UserRole;
  const maskedEmail = user.email ? maskEmail(user.email) : null;

  if (role === 'MD') {
    return { found: true, selfService: true, maskedEmail };
  }

  const { status, channel } = await requestService.getLatestRequestStatus(user.userId);
  return {
    found: true,
    selfService: false,
    maskedEmail,
    requestStatus: status,
    ...(channel ? { channel } : {}),
    approverRolesLabel: approverRolesLabel(role),
  };
}

/**
 * Generates + delivers an OTP. Silently no-ops (no throw) if the user
 * doesn't exist, is inactive, or has no contact info for the requested
 * channel — same enumeration-safety reasoning as requestPasswordReset.
 * Rate limiting (route layer) is what actually bounds abuse here.
 */
export async function sendOtp(username: string, channel: OtpChannel, req: Request): Promise<void> {
  assertOtpDeliveryPossible(channel);

  const [user] = await db.select().from(appUser).where(eq(appUser.username, username)).limit(1);
  if (!user || !user.isActive) return;

  const role = user.role as UserRole;

  // Non-MD roles can't self-serve — an OTP only ever gets issued once an
  // eligible approver exists for an active request (Priority 2/6), and it
  // is delivered to the approver(s) rather than the requester: the OTP
  // itself is the approval, relayed out of band. Everything below this
  // recipient-resolution step is the exact same OTP machinery MD uses.
  let approverEmails: string[] = [];
  if (role !== 'MD') {
    const approved = await requestService.hasApprovedRequest(user.userId, channel);
    if (!approved) return;
    approverEmails = await requestService.getEligibleApproverEmails(role);
    if (approverEmails.length === 0) return;
  } else if (!user.email) {
    return;
  }

  // Invalidate any previous unconsumed OTP for this user+channel so only
  // the newest one is ever valid.
  await db
    .update(passwordResetOtp)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(passwordResetOtp.userId, user.userId),
        eq(passwordResetOtp.channel, channel),
        isNull(passwordResetOtp.consumedAt),
      ),
    );

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const { userAgent, ip } = requestFingerprint(req);

  await db.insert(passwordResetOtp).values({
    userId: user.userId,
    channel,
    otpHash,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    userAgent,
    ipAddress: ip,
  });

  if (role !== 'MD') {
    const results = await Promise.allSettled(
      approverEmails.map((email) => sendApprovalRequestEmail(email, user.username, role, otp)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    // Never the code itself, nor the approvers' addresses (S-04, S-11).
    logger.info('auth.otp.issued', {
      userId: user.userId,
      role,
      deliveredTo: 'approvers',
      approverCount: approverEmails.length,
      deliveryFailures: failed,
    });
    return;
  }

  await sendOtpEmail(user.email as string, otp);
  logger.info('auth.otp.issued', { userId: user.userId, role, deliveredTo: 'self' });
}

export interface VerifyOtpResult {
  resetToken: string;
}

export async function verifyOtp(
  username: string,
  channel: OtpChannel,
  code: string,
): Promise<VerifyOtpResult> {
  const [user] = await db.select().from(appUser).where(eq(appUser.username, username)).limit(1);
  if (!user || !user.isActive) {
    throw new HttpError(400, 'INVALID_OTP', INVALID_OTP_MESSAGE);
  }

  const [otpRow] = await db
    .select()
    .from(passwordResetOtp)
    .where(
      and(
        eq(passwordResetOtp.userId, user.userId),
        eq(passwordResetOtp.channel, channel),
        isNull(passwordResetOtp.consumedAt),
      ),
    )
    .orderBy(desc(passwordResetOtp.createdAt))
    .limit(1);

  if (!otpRow) {
    throw new HttpError(400, 'INVALID_OTP', INVALID_OTP_MESSAGE);
  }
  if (otpRow.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(400, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  }

  // Reserve the attempt BEFORE comparing (finding S-27). The old code read
  // the counter, compared, then wrote counter+1, so parallel guesses all
  // read the same value and together exceeded MAX_OTP_ATTEMPTS. A single
  // UPDATE ... WHERE attempts < MAX ... RETURNING is atomic: PostgreSQL
  // re-checks the condition under the row lock, so however many requests
  // race, at most MAX_OTP_ATTEMPTS of them get past this point.
  const [reserved] = await db
    .update(passwordResetOtp)
    .set({ attempts: sql`${passwordResetOtp.attempts} + 1` })
    .where(
      and(
        eq(passwordResetOtp.otpId, otpRow.otpId),
        isNull(passwordResetOtp.consumedAt),
        lt(passwordResetOtp.attempts, MAX_OTP_ATTEMPTS),
      ),
    )
    .returning({ attempts: passwordResetOtp.attempts });
  if (!reserved) {
    logger.warn('auth.otp.locked', { userId: user.userId });
    throw new HttpError(429, 'OTP_LOCKED', 'Too many incorrect attempts. Request a new code.');
  }

  const ok = await compareOtp(code, otpRow.otpHash);
  if (!ok) {
    logger.warn('auth.otp.verify_failure', {
      userId: user.userId,
      attempt: reserved.attempts,
      maxAttempts: MAX_OTP_ATTEMPTS,
    });
    throw new HttpError(400, 'INVALID_OTP', INVALID_OTP_MESSAGE);
  }

  // Single use, also atomic: of two simultaneous correct submissions only
  // one consumes the code and receives a reset token.
  const reset = await signResetToken(otpRow.otpId);
  const [consumed] = await db
    .update(passwordResetOtp)
    .set({
      consumedAt: new Date(),
      resetTokenHash: reset.hash,
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    })
    .where(and(eq(passwordResetOtp.otpId, otpRow.otpId), isNull(passwordResetOtp.consumedAt)))
    .returning({ otpId: passwordResetOtp.otpId });
  if (!consumed) {
    throw new HttpError(400, 'INVALID_OTP', INVALID_OTP_MESSAGE);
  }

  logger.info('auth.otp.verified', { userId: user.userId });
  return { resetToken: reset.value };
}

export async function resetPassword(
  resetToken: string,
  password: string,
  confirmPassword: string,
): Promise<void> {
  if (password !== confirmPassword) {
    throw new HttpError(400, 'PASSWORD_MISMATCH', 'Passwords do not match');
  }

  let parsed;
  try {
    parsed = parseResetToken(resetToken);
  } catch {
    throw new HttpError(400, 'INVALID_RESET_TOKEN', INVALID_RESET_TOKEN_MESSAGE);
  }

  const [otpRow] = await db
    .select()
    .from(passwordResetOtp)
    .where(eq(passwordResetOtp.otpId, parsed.otpId))
    .limit(1);

  if (!otpRow || !otpRow.resetTokenHash || !otpRow.resetTokenExpiresAt) {
    throw new HttpError(400, 'INVALID_RESET_TOKEN', INVALID_RESET_TOKEN_MESSAGE);
  }
  if (otpRow.resetTokenExpiresAt.getTime() <= Date.now()) {
    throw new HttpError(400, 'INVALID_RESET_TOKEN', INVALID_RESET_TOKEN_MESSAGE);
  }
  const tokenOk = await verifyResetToken(parsed.rawSecret, otpRow.resetTokenHash);
  if (!tokenOk) {
    throw new HttpError(400, 'INVALID_RESET_TOKEN', INVALID_RESET_TOKEN_MESSAGE);
  }

  const [user] = await db.select().from(appUser).where(eq(appUser.userId, otpRow.userId)).limit(1);
  if (!user || !user.isActive) {
    throw new HttpError(400, 'INVALID_RESET_TOKEN', INVALID_RESET_TOKEN_MESSAGE);
  }

  // Same length policy as everywhere else passwords are set (createUserSchema
  // / updateUserSchema in usersService.ts, and hashPassword's own guard).
  if (password.length < 8) {
    throw new HttpError(400, 'WEAK_PASSWORD', 'Password must be at least 8 characters');
  }

  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.update(appUser).set({ passwordHash }).where(eq(appUser.userId, user.userId));

    // Single-use: a reset token can't be replayed once the password changes.
    await tx
      .update(passwordResetOtp)
      .set({ resetTokenHash: null, resetTokenExpiresAt: null })
      .where(eq(passwordResetOtp.otpId, otpRow.otpId));

    // Force re-login everywhere — same revoke-all query authService.refresh()
    // uses when it detects refresh-token reuse.
    await tx
      .update(refreshToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshToken.userId, user.userId), isNull(refreshToken.revokedAt)));

    if ((user.role as UserRole) !== 'MD') {
      await requestService.completeApprovedRequest(tx, user.userId);
    }

    await recordAudit(tx, {
      actor: { userId: user.userId, username: user.username, role: user.role as UserRole },
      action: 'Updated',
      projectId: null,
      projectNameSnapshot: null,
      changes: diffAppUser({ passwordChanged: 'previous' }, { passwordChanged: 'updated' }),
    });
  });

  logger.info('auth.password_reset.completed', {
    userId: user.userId,
    effect: 'all sessions of the user revoked',
  });
}
