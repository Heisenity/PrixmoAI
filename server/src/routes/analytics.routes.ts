import { Router } from 'express';
import {
  getBestPost,
  getStats,
  getWeeklyScore,
} from '../controllers/analytics.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/stats', authMiddleware, getStats);
router.get('/best-post', authMiddleware, getBestPost);
router.get('/weekly-score', authMiddleware, getWeeklyScore);

export default router;
