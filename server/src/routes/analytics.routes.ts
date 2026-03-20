import { Router } from 'express';
import {
  getBestPost,
  getHistory,
  getInternalResearchEvents,
  getInternalResearchSummary,
  getOverview,
  getSummary,
  getWeeklyComparison,
  recordAnalytics,
} from '../controllers/analytics.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { developerAnalyticsMiddleware } from '../middleware/developerAnalytics.middleware';
import { validate } from '../middleware/validate.middleware';
import { recordAnalyticsSchema } from '../schemas/analytics.schema';

const router = Router();

router.post('/record', authMiddleware, validate(recordAnalyticsSchema), recordAnalytics);
router.get('/overview', authMiddleware, getOverview);
router.get('/summary', authMiddleware, getSummary);
router.get('/weekly-comparison', authMiddleware, getWeeklyComparison);
router.get('/best-post', authMiddleware, getBestPost);
router.get('/history', authMiddleware, getHistory);

router.get(
  '/internal/research/summary',
  developerAnalyticsMiddleware,
  getInternalResearchSummary
);
router.get(
  '/internal/research/events',
  developerAnalyticsMiddleware,
  getInternalResearchEvents
);

export default router;
