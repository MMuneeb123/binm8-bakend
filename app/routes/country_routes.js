import express from 'express';
import { countryController } from '../controllers/country_controller.js';
import { validate } from '../middleware/validate.js';
import { countrySchemas } from '../validations/country_schemas.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Public country routes (authenticated users)
router.get('/', countryController.getCountries);
router.get('/:code/holidays', countryController.getHolidays);

// Admin-only country routes
router.post(
    '/',
    requireAdmin,
    validate(countrySchemas.addCountry),
    countryController.addCountry
);

router.patch(
    '/:code',
    requireAdmin,
    validate(countrySchemas.addCountry),
    countryController.updateCountry
);

// Admin-only holiday routes
router.post(
    '/:code/holidays',
    requireAdmin,
    validate(countrySchemas.addHoliday),
    countryController.addHoliday
);

router.post(
    '/:code/holidays/bulk',
    requireAdmin,
    validate(countrySchemas.addHolidays),
    countryController.addHolidays
);

router.patch(
    '/:code/holidays/:holidayId',
    requireAdmin,
    validate(countrySchemas.updateHoliday),
    countryController.updateHoliday
);

router.delete(
    '/:code/holidays/:holidayId',
    requireAdmin,
    countryController.deleteHoliday
);

export default router; 