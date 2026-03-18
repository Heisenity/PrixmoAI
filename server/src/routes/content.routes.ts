import { Router } from 'express';
import {
  deleteContent,
  generateContent,
  getContentHistory,
} from '../controllers/content.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { planLimitMiddleware } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import { generateContentSchema } from '../schemas/content.schema';

const router = Router();

router.post(
  '/generate',
  authMiddleware,
  validate(generateContentSchema),
  planLimitMiddleware('content_generation'),
  generateContent
);

router.get('/history', authMiddleware, getContentHistory);
router.delete('/:id', authMiddleware, deleteContent);

export default router;
