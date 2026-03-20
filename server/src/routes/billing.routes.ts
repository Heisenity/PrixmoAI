import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  cancelBillingSubscriptionController,
  createBillingCheckout,
  getBillingPlanCatalog,
  getCurrentBillingSubscription,
  syncBillingSubscription,
} from '../controllers/billing.controller';
import {
  cancelSubscriptionSchema,
  createBillingCheckoutSchema,
  syncSubscriptionSchema,
} from '../schemas/billing.schema';

const router = Router();

router.get('/plans', authMiddleware, getBillingPlanCatalog);
router.get('/subscription', authMiddleware, getCurrentBillingSubscription);
router.post(
  '/checkout',
  authMiddleware,
  validate(createBillingCheckoutSchema),
  createBillingCheckout
);
router.post(
  '/sync',
  authMiddleware,
  validate(syncSubscriptionSchema),
  syncBillingSubscription
);
router.post(
  '/cancel',
  authMiddleware,
  validate(cancelSubscriptionSchema),
  cancelBillingSubscriptionController
);

export default router;
