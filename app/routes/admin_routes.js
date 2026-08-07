import express from 'express';
// Controller ko import karein (Extension .js zaroor lagayein):
import * as adminController from '../controllers/admin_controller.js'; 

const router = express.Router();

// Routes
router.get('/users', adminController.getAllUsers);
router.patch('/users/status', adminController.updateUserStatus);


export default router;