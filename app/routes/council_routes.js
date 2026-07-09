import express from 'express';
import {
    getCouncils,
    getCouncilById,
    getCouncilTypes,
    addCouncil,
    updateCouncil,
    bulkAddCouncils
} from '../controllers/council_controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { councilSchemas } from '../validations/schemas.js';

const router = express.Router();

// Public routes (for onboarding)
router.get('/', validateQuery(councilSchemas.getCouncils), getCouncils);
router.get('/types', getCouncilTypes);
router.get('/:id', getCouncilById);

// Admin routes (protected)
router.post('/', authenticateToken, requireAdmin, validateBody(councilSchemas.addCouncil), addCouncil);
router.post('/bulk', authenticateToken, requireAdmin, validateBody(councilSchemas.bulkAddCouncils), bulkAddCouncils);
router.put('/:id', authenticateToken, requireAdmin, validateBody(councilSchemas.updateCouncil), updateCouncil);

export default router;

