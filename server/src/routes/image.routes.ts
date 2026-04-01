import { Router } from 'express';
import {
  generateImage,
  getWatermarkedImage,
  getImageHistory,
  importSourceImageUrl,
  uploadSourceImage,
} from '../controllers/image.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  imagePlanLimitMiddleware,
  imageRuntimePolicyMiddleware,
} from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  generateImageSchema,
  importSourceImageUrlSchema,
  uploadSourceImageSchema,
} from '../schemas/image.schema';

const router = Router();

router.post(
  '/upload-source',
  authMiddleware,
  validate(uploadSourceImageSchema),
  uploadSourceImage
);
router.post(
  '/import-source-url',
  authMiddleware,
  validate(importSourceImageUrlSchema),
  importSourceImageUrl
);
router.post(
  '/generate',
  authMiddleware,
  validate(generateImageSchema),
  imagePlanLimitMiddleware,
  imageRuntimePolicyMiddleware,
  generateImage
);
router.get('/history', authMiddleware, getImageHistory);
router.get('/:id/watermarked', authMiddleware, getWatermarkedImage);

export default router;
