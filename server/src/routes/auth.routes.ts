import { Router } from 'express';
import {
  getMe,
  loginWithPassword,
  logout,
  restoreSession,
  saveProfile,
  sendForgotPasswordMagicLink,
  sendMagicLink,
  sendPasswordResetEmail,
  updatePassword,
} from '../controllers/auth.controller';
import { authRateLimit } from '../middleware/authRateLimit.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  authEmailSchema,
  authSessionSchema,
  passwordLoginSchema,
  updatePasswordSchema,
} from '../schemas/auth.schema';
import { authProfileSchema } from '../schemas/user.schema';

const router = Router();
const authEmailLimiter = authRateLimit(5, 15 * 60 * 1000);
const authLoginLimiter = authRateLimit(10, 15 * 60 * 1000);

router.post('/magic-link', authEmailLimiter, validate(authEmailSchema), sendMagicLink);
router.post('/login', authLoginLimiter, validate(passwordLoginSchema), loginWithPassword);
router.post(
  '/forgot-password/magic-link',
  authEmailLimiter,
  validate(authEmailSchema),
  sendForgotPasswordMagicLink
);
router.post(
  '/forgot-password/reset',
  authEmailLimiter,
  validate(authEmailSchema),
  sendPasswordResetEmail
);
router.post('/session', validate(authSessionSchema), restoreSession);
router.post('/update-password', validate(updatePasswordSchema), updatePassword);
router.post('/logout', validate(authSessionSchema), logout);
router.post('/profile', authMiddleware, validate(authProfileSchema), saveProfile);
router.get('/me', authMiddleware, getMe);

export default router;
