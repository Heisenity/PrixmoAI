import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  cancelPostSchedule,
  createPostSchedule,
  createConnectedSocialAccount,
  deletePostSchedule,
  finalizePendingMetaFacebookPages,
  handleMetaOAuthCallback,
  listPendingMetaFacebookPages,
  listConnectedSocialAccounts,
  listScheduledPosts,
  removeConnectedSocialAccount,
  startMetaOAuth,
  updateConnectedSocialAccount,
  updatePostSchedule,
  updatePostScheduleStatus,
} from '../controllers/scheduler.controller';
import { validate } from '../middleware/validate.middleware';
import {
  createScheduledPostSchema,
  createSocialAccountSchema,
  finalizeMetaFacebookPagesSchema,
  startMetaOAuthSchema,
  updateScheduledPostSchema,
  updateScheduledPostStatusSchema,
  updateSocialAccountSchema,
} from '../schemas/scheduler.schema';

const router = Router();

router.post(
  '/oauth/meta/start',
  authMiddleware,
  validate(startMetaOAuthSchema),
  startMetaOAuth
);
router.get('/oauth/meta/callback', handleMetaOAuthCallback);
router.get(
  '/oauth/meta/pending/facebook-pages/:id',
  authMiddleware,
  listPendingMetaFacebookPages
);
router.post(
  '/oauth/meta/finalize/facebook-pages',
  authMiddleware,
  validate(finalizeMetaFacebookPagesSchema),
  finalizePendingMetaFacebookPages
);

router.post(
  '/accounts',
  authMiddleware,
  validate(createSocialAccountSchema),
  createConnectedSocialAccount
);
router.get('/accounts', authMiddleware, listConnectedSocialAccounts);
router.patch(
  '/accounts/:id',
  authMiddleware,
  validate(updateSocialAccountSchema),
  updateConnectedSocialAccount
);
router.delete('/accounts/:id', authMiddleware, removeConnectedSocialAccount);

router.post(
  '/posts',
  authMiddleware,
  validate(createScheduledPostSchema),
  createPostSchedule
);
router.get('/posts', authMiddleware, listScheduledPosts);
router.patch(
  '/posts/:id',
  authMiddleware,
  validate(updateScheduledPostSchema),
  updatePostSchedule
);
router.patch(
  '/posts/:id/status',
  authMiddleware,
  validate(updateScheduledPostStatusSchema),
  updatePostScheduleStatus
);
router.post('/posts/:id/cancel', authMiddleware, cancelPostSchedule);
router.delete('/posts/:id', authMiddleware, deletePostSchedule);

export default router;
