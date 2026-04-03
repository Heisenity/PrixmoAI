import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  addScheduleBatchItems,
  cancelPostSchedule,
  cancelScheduleItemRecord,
  createScheduleBatchDraft,
  createSchedulerMediaAsset,
  createPostSchedule,
  createConnectedSocialAccount,
  deleteScheduleBatchDraft,
  deletePostSchedule,
  finalizePendingMetaFacebookPages,
  getScheduleBatch,
  handleMetaOAuthCallback,
  listScheduleBatches,
  listScheduleItems,
  listPendingMetaFacebookPages,
  listConnectedSocialAccounts,
  listScheduledPosts,
  removeConnectedSocialAccount,
  startMetaOAuth,
  submitScheduleBatch,
  updateScheduleItemRecord,
  updateConnectedSocialAccount,
  updatePostSchedule,
  updatePostScheduleStatus,
} from '../controllers/scheduler.controller';
import { validate } from '../middleware/validate.middleware';
import {
  addBatchItemsSchema,
  createMediaAssetSchema,
  createScheduleBatchSchema,
  createScheduledPostSchema,
  createSocialAccountSchema,
  finalizeMetaFacebookPagesSchema,
  listScheduleBatchesSchema,
  listScheduledItemsSchema,
  startMetaOAuthSchema,
  updateScheduledItemSchema,
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
  '/media-assets',
  authMiddleware,
  validate(createMediaAssetSchema),
  createSchedulerMediaAsset
);

router.post(
  '/batches',
  authMiddleware,
  validate(createScheduleBatchSchema),
  createScheduleBatchDraft
);
router.get(
  '/batches',
  authMiddleware,
  validate(listScheduleBatchesSchema),
  listScheduleBatches
);
router.get('/batches/:id', authMiddleware, getScheduleBatch);
router.delete('/batches/:id', authMiddleware, deleteScheduleBatchDraft);
router.post(
  '/batches/:id/items',
  authMiddleware,
  validate(addBatchItemsSchema),
  addScheduleBatchItems
);
router.post('/batches/:id/submit', authMiddleware, submitScheduleBatch);
router.get(
  '/items',
  authMiddleware,
  validate(listScheduledItemsSchema),
  listScheduleItems
);
router.patch(
  '/items/:id',
  authMiddleware,
  validate(updateScheduledItemSchema),
  updateScheduleItemRecord
);
router.post('/items/:id/cancel', authMiddleware, cancelScheduleItemRecord);

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
