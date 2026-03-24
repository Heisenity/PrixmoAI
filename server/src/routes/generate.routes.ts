import { Router } from 'express';
import {
  createWorkspaceConversation,
  deleteWorkspaceConversation,
  generateWorkspaceCopy,
  generateWorkspaceImage,
  getWorkspaceConversationThread,
  listWorkspaceConversations,
  updateWorkspaceConversation,
} from '../controllers/generateWorkspace.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  imagePlanLimitMiddleware,
  planLimitMiddleware,
} from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createGenerateConversationSchema,
  generateConversationCopySchema,
  generateConversationImageSchema,
  updateGenerateConversationSchema,
} from '../schemas/generateWorkspace.schema';

const router = Router();

router.get('/conversations', authMiddleware, listWorkspaceConversations);
router.post(
  '/conversations',
  authMiddleware,
  validate(createGenerateConversationSchema),
  createWorkspaceConversation
);
router.get('/conversations/:id', authMiddleware, getWorkspaceConversationThread);
router.patch(
  '/conversations/:id',
  authMiddleware,
  validate(updateGenerateConversationSchema),
  updateWorkspaceConversation
);
router.delete('/conversations/:id', authMiddleware, deleteWorkspaceConversation);

router.post(
  '/copy',
  authMiddleware,
  planLimitMiddleware,
  validate(generateConversationCopySchema),
  generateWorkspaceCopy
);

router.post(
  '/image',
  authMiddleware,
  imagePlanLimitMiddleware,
  validate(generateConversationImageSchema),
  generateWorkspaceImage
);

export default router;
