import { Router } from 'express';
import { getMe, saveProfile } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authProfileSchema } from '../schemas/user.schema';

const router = Router();

router.post('/profile', authMiddleware, validate(authProfileSchema), saveProfile);
router.get('/me', authMiddleware, getMe);

export default router;
