import express from 'express';
import { userController } from '../controllers/user_controller.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { validateBody } from '../middleware/validate.js';
import { userSchemas } from '../validations/schemas.js';

const router = express.Router();

// Route for users to get their own profile
router.get('/me', authenticateToken, userController.getProfile);
// Route for users to edit their own profile (name and country)
router.put('/me', authenticateToken, validateBody(userSchemas.editProfile), userController.editProfile);
// Timezone + collection reminders (full replace for array when provided)
router.patch('/me', authenticateToken, validateBody(userSchemas.patchMeReminders), userController.patchMe);
// Route for users to delete their own account
router.delete('/me', authenticateToken, validateBody(userSchemas.deleteAccount), userController.deleteAccount);

// All routes require authentication and admin privileges
router.use(authenticateToken);
router.use(requireAdmin);
// Admin user management routes
router.post('/', validateBody(userSchemas.createUser), userController.createUser);
router.get('/', userController.getUsers);
router.get('/:userId', userController.getUserById);
router.put('/:userId', validateBody(userSchemas.updateUser), userController.updateUser);
router.delete('/:userId', userController.deleteUser);

export default router; 