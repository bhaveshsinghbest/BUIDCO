/**
 * Who may see another official's e-mail address and mobile number
 * (finding S-31, data minimisation under the DPDP Act 2023).
 *
 * Contact details exist for one purpose: delivering password-reset codes.
 * So they are shown only to the people who maintain them:
 *
 *   MD      every account
 *   Admin   the PD and Viewer accounts an Admin creates and edits
 *   PD      none (a PD may list and delete Viewers, but never edits them)
 *   Viewer  none (no access to user management at all)
 *
 * Everyone may see their own. The rule is enforced in the API responses
 * (usersService.listUsers, auditService.listAudit), not just in the UI.
 * To change the policy, change this function and its tests.
 */
import type { UserRole } from '../db/enums.js';
import { maskEmail, maskMobile } from './otp.js';

export function canSeeContactDetails(
  viewer: { userId: number | null; role: UserRole },
  subject: { userId: number; role: UserRole },
): boolean {
  if (viewer.userId !== null && viewer.userId === subject.userId) return true;
  switch (viewer.role) {
    case 'MD':
      return true;
    case 'Admin':
      return subject.role === 'PD' || subject.role === 'Viewer';
    default:
      return false;
  }
}

/** audit_log_change.field_key values that hold contact details. */
export const CONTACT_FIELD_KEYS = new Set(['email', 'mobileNumber']);

/**
 * Masks a contact value recorded in the audit trail. Only an MD sees these
 * unmasked: an audit row does not say whose account it was, and Admins can
 * read the full details of the accounts they manage in User Management.
 */
export function maskContactValue(fieldKey: string, value: string | null): string | null {
  if (value === null || value === '') return value;
  return fieldKey === 'email' ? maskEmail(value) : maskMobile(value);
}
