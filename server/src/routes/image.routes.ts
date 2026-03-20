import { Router } from 'express';
import {
  generateImage,
  getImageHistory,
} from '../controllers/image.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { imagePlanLimitMiddleware } from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import { generateImageSchema } from '../schemas/image.schema';

const router = Router();

router.post(
  '/generate',
  authMiddleware,
  imagePlanLimitMiddleware,
  validate(generateImageSchema),
  generateImage
);
router.get('/history', authMiddleware, getImageHistory);

export default router;
