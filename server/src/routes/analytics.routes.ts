import { Router } from 'express';
import {
  getBestPost,
  getDashboard,
  getHistory,
  getInternalResearchEvents,
  getInternalResearchSummary,
  getOverview,
  getSummary,
  syncAnalytics,
  getWeeklyComparison,
  recordAnalytics,
} from '../controllers/analytics.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { developerAnalyticsMiddleware } from '../middleware/developerAnalytics.middleware';
import { validate } from '../middleware/validate.middleware';
import { recordAnalyticsSchema } from '../schemas/analytics.schema';

const router = Router();

router.post('/record', authMiddleware, validate(recordAnalyticsSchema), recordAnalytics);
router.post('/sync', authMiddleware, syncAnalytics);
router.get('/dashboard', authMiddleware, getDashboard);
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
