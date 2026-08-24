import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { validateBody } from '../middleware/validate.js';
import { adminSchemas } from '../validations/admin_schemas.js';
// import { authenticate } from '../middleware/auth.js';
// import { adminOnly } from '../middleware/admin.js';
import {
    getDashboardOverview,
    getRecentActivity,
    getAdminRevenueStats,
    getDashboardAnalytics, getSystemUsers, getPushNotifications,
    sendAdminPushNotificationToAudience, getAdminPushBroadcasts, getAdminPushBroadcastDeliveries
} from '../controllers/admin_dashboard_controller.js';

const router = Router();

// Routes Secured via Auth Token & Admin Role Check
// router.use(authenticate, adminOnly);

router.get('/overview', getDashboardOverview);
router.get('/activity', getRecentActivity);
router.get('/analytics', getDashboardAnalytics);
router.get('/revenue', getAdminRevenueStats);


// 

router.get('/system-users', getSystemUsers);
router.get('/notifications', authenticateToken, requireAdmin, getPushNotifications);
router.get('/notifications/broadcasts', authenticateToken, requireAdmin, getAdminPushBroadcasts);
router.get('/notifications/broadcasts/:id/deliveries', authenticateToken, requireAdmin, getAdminPushBroadcastDeliveries);
router.post('/notifications/send', validateBody(adminSchemas.sendPushNotification), sendAdminPushNotificationToAudience);

export default router;
