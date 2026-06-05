import { Router } from 'express';
import {
  deleteAdminGrant,
  getAdminGrants,
  getAdminHealth,
  getMyAdminAccess,
  getUserDebug,
  runAdminAction,
  saveAdminGrant,
} from '../controllers/adminHealth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminAccessMiddleware } from '../middleware/adminAccess.middleware';
import { validate } from '../middleware/validate.middleware';
import { ADMIN_PERMISSIONS } from '../lib/adminAccess';
import {
  adminGrantSchema,
  adminSafeActionSchema,
  adminUserDebugQuerySchema,
} from '../schemas/adminHealth.schema';

const router = Router();

router.get(
  '/access/me',
  authMiddleware,
  adminAccessMiddleware(),
  getMyAdminAccess
);

router.get(
  '/overview',
  authMiddleware,
  adminAccessMiddleware(ADMIN_PERMISSIONS.systemHealthView),
  getAdminHealth
);

router.get(
  '/grants',
  authMiddleware,
  adminAccessMiddleware(ADMIN_PERMISSIONS.adminAccessManage),
  getAdminGrants
);

router.post(
  '/grants',
  authMiddleware,
  adminAccessMiddleware(ADMIN_PERMISSIONS.adminAccessManage),
  validate(adminGrantSchema),
  saveAdminGrant
);

router.delete(
  '/grants/:grantId',
  authMiddleware,
  adminAccessMiddleware(ADMIN_PERMISSIONS.adminAccessManage),
  deleteAdminGrant
);

router.post(
  '/actions',
  authMiddleware,
  adminAccessMiddleware(ADMIN_PERMISSIONS.safeActionsRun),
  validate(adminSafeActionSchema),
  runAdminAction
);

router.get(
  '/user-debug',
  authMiddleware,
  adminAccessMiddleware(ADMIN_PERMISSIONS.userDebugView),
  validate(adminUserDebugQuerySchema),
  getUserDebug
);

export default router;
