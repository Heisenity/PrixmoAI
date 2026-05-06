import { Router } from 'express';
import {
  deleteContent,
  generateContent,
  getContentHistory,
  recommendScheduleCaption,
  submitContentFeedback,
} from '../controllers/content.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { planLimitMiddleware } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  contentFeedbackSchema,
  generateContentSchema,
  recommendScheduleCaptionSchema,
} from '../schemas/content.schema';

const router = Router();

router.post(
  '/generate',
  authMiddleware,
  planLimitMiddleware,
  validate(generateContentSchema),
  generateContent
);
router.get('/history', authMiddleware, getContentHistory);
router.post(
  '/feedback',
  authMiddleware,
  validate(contentFeedbackSchema),
  submitContentFeedback
);
router.post(
  '/:id/schedule-recommendation',
  authMiddleware,
  validate(recommendScheduleCaptionSchema),
  recommendScheduleCaption
);
router.delete('/:id', authMiddleware, deleteContent);

export default router;
