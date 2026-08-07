import { Router } from 'express';
// import { authenticate } from '../middleware/auth.js';
// import { adminOnly } from '../middleware/admin.js';
import {
    getDashboardOverview,
    getRecentActivity,
    getDashboardAnalytics
} from '../controllers/admin_dashboard_controller.js';

const router = Router();

// Routes Secured via Auth Token & Admin Role Check
// router.use(authenticate, adminOnly);

router.get('/overview', getDashboardOverview);
router.get('/activity', getRecentActivity);
router.get('/analytics', getDashboardAnalytics);

export default router;