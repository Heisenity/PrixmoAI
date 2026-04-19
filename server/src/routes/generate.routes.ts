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
import { transcribeGenerateAudio } from '../controllers/transcription.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  imagePlanLimitMiddleware,
  imageRuntimePolicyMiddleware,
  planLimitMiddleware,
} from '../middleware/planLimit.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createGenerateConversationSchema,
  generateConversationCopySchema,
  generateConversationImageSchema,
  updateGenerateConversationSchema,
} from '../schemas/generateWorkspace.schema';
import { transcribeAudioSchema } from '../schemas/transcription.schema';

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
  validate(generateConversationImageSchema),
  imagePlanLimitMiddleware,
  imageRuntimePolicyMiddleware,
  generateWorkspaceImage
);

router.post(
  '/transcribe',
  authMiddleware,
  validate(transcribeAudioSchema),
  transcribeGenerateAudio
);

export default router;
