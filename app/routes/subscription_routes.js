import express from 'express';
import { handleRevenueCatWebhook, syncUserSubscription } from '../controllers/subscription_controller.js';

const router = express.Router();

// RevenueCat Webhook Public Route
router.post('/webhook', handleRevenueCatWebhook);

// User Subscription Sync Route
router.post('/sync', syncUserSubscription);

export default router;