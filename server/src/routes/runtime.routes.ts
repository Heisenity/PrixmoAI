import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { cancelJobRuntime, getJobRuntime } from '../controllers/runtime.controller';

const router = Router();

router.get('/jobs/:id', authMiddleware, getJobRuntime);
router.post('/jobs/:id/cancel', authMiddleware, cancelJobRuntime);

export default router;
