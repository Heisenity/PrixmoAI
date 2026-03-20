import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createPostSchedule,
  createConnectedSocialAccount,
  deletePostSchedule,
  listConnectedSocialAccounts,
  listScheduledPosts,
  removeConnectedSocialAccount,
  updateConnectedSocialAccount,
  updatePostSchedule,
  updatePostScheduleStatus,
} from '../controllers/scheduler.controller';
import { validate } from '../middleware/validate.middleware';
import {
  createScheduledPostSchema,
  createSocialAccountSchema,
  updateScheduledPostSchema,
  updateScheduledPostStatusSchema,
  updateSocialAccountSchema,
} from '../schemas/scheduler.schema';

const router = Router();

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
router.delete('/posts/:id', authMiddleware, deletePostSchedule);

export default router;
