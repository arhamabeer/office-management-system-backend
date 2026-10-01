import type { AccountType, OrgRole } from '@ems/types';
import { asyncHandler } from '../common/asyncHandler';
import { UnauthorizedError } from '../common/errors';
import { verifyAccessToken } from '../modules/auth/token.service';
import { User } from '../modules/auth/user.model';

/** The authenticated principal attached to a request (both role dimensions). */
export interface AuthUser {
  id: string;
  email: string;
  accountType: AccountType;
  orgRole: OrgRole;
}

/** Verify the access JWT, load the (fresh) user, and attach `req.user`.
 *  Loading the user each request means role changes and deactivation take
 *  effect immediately, and tokens issued before a password change are rejected. */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'Active') {
    throw new UnauthorizedError('Account is not active');
  }
  // Compare on whole seconds: JWT `iat` is floored to seconds, so multiplying by
  // 1000 and comparing to a millisecond timestamp would (wrongly) invalidate a
  // token issued in the same second the password changed (e.g. accept-invite).
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw new UnauthorizedError('Session expired, please log in again');
  }

  req.user = {
    id: String(user._id),
    email: user.email,
    accountType: user.accountType as AccountType,
    orgRole: user.orgRole as OrgRole,
  };
  next();
});
