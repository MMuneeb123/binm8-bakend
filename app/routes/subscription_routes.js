import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getSubscriptionStatus, updateSubscription } from '../controllers/subscription_controller.js';

const router = Router();
router.use(authenticateToken);

router.get('/status', getSubscriptionStatus);
router.post('/upgrade', updateSubscription);

export default router;