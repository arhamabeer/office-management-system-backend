import { Router } from 'express';
import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  acceptInviteSchema,
  inviteTokenParamSchema,
} from '@ems/validation';
import { validate } from '../../middleware/validate';
import { authRateLimiter } from '../../middleware/rateLimit';
import { requireAuth } from '../../middleware/auth';
import * as c from './auth.controller';

const router = Router();

router.post('/login', authRateLimiter, validate({ body: loginSchema }), c.loginHandler);
router.post('/refresh', c.refreshHandler);
router.post('/logout', c.logoutHandler);
router.get('/me', requireAuth, c.meHandler);
router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  c.changePasswordHandler,
);
router.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  c.forgotPasswordHandler,
);
router.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  c.resetPasswordHandler,
);
// Public: the onboarding page fetches the invitee's details by token. Read-only
// with an opaque token, so the general limiter suffices — no need to spend the
// stricter auth budget (which the login form shares).
router.get('/invite/:token', validate({ params: inviteTokenParamSchema }), c.inviteInfoHandler);
router.post('/accept-invite', authRateLimiter, validate({ body: acceptInviteSchema }), c.acceptInviteHandler);

export default router;
