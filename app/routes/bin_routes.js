import express from 'express';
import { 
  addUserBin,
  updateBinSchedule,
  updateBinAppearance,
  getUserBins,
  getUpcomingCollections,
  deleteUserBin,
  markBinCollected,
  replaceBinReminderRules,
  testNotifications
} from '../controllers/bin_controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { binSchemas } from '../validations/schemas.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Bin routes with validation
router.post('/add', validateBody(binSchemas.addBin), addUserBin);
router.put('/:id/reminders', validateBody(binSchemas.replaceBinReminders), replaceBinReminderRules);
router.put('/:id/schedule', validateBody(binSchemas.updateBinSchedule), updateBinSchedule);
router.put('/:id/appearance', validateBody(binSchemas.updateBinAppearance), updateBinAppearance);
router.delete('/:id', deleteUserBin);
router.post('/:id/mark-collected', validateBody(binSchemas.markCollected), markBinCollected);
router.get('/upcoming', validateQuery(binSchemas.getUpcomingCollections), getUpcomingCollections);
router.get('/', getUserBins);
// Test endpoint for immediate notifications
router.post('/test-notifications', testNotifications);

export default router;