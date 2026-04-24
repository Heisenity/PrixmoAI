import { Router } from 'express';
import {
  getMe,
  checkUsernameAvailability,
  saveProfile,
  suggestBrandDescription,
  suggestIndustry,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  authProfileSchema,
  brandDescriptionSuggestionSchema,
  industrySuggestionSchema,
  usernameAvailabilitySchema,
} from '../schemas/user.schema';

const router = Router();

router.post('/profile', authMiddleware, validate(authProfileSchema), saveProfile);
router.post(
  '/username-availability',
  authMiddleware,
  validate(usernameAvailabilitySchema),
  checkUsernameAvailability
);
router.post(
  '/industry-suggestion',
  authMiddleware,
  validate(industrySuggestionSchema),
  suggestIndustry
);
router.post(
  '/brand-description-suggestion',
  authMiddleware,
  validate(brandDescriptionSuggestionSchema),
  suggestBrandDescription
);
router.get('/me', authMiddleware, getMe);

export default router;
