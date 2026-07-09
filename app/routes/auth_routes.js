import { Router } from "express";
import { 
    register, 
    login, 
    forgotPassword, 
    resetPassword,
    refreshToken,
    logout,
    sendVerificationEmail,
    verifyEmail,
    resendVerificationOTP,
    resendPasswordResetOTP,
    changePassword
} from "../controllers/auth_controller.js";
import { validateBody } from "../middleware/validate.js";
import { authSchemas } from "../validations/schemas.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// Public routes
router.post("/login", validateBody(authSchemas.login), login);
router.post("/register", validateBody(authSchemas.register), register);
router.post("/refresh-token", validateBody(authSchemas.refreshToken), refreshToken);
router.post("/forgot-password", validateBody(authSchemas.forgotPassword), forgotPassword);
router.post("/reset-password", validateBody(authSchemas.resetPassword), resetPassword);
router.post("/logout", validateBody(authSchemas.logout), logout);

// Email verification routes
router.post("/send-verification", validateBody(authSchemas.sendVerification), sendVerificationEmail);
router.post("/verify-email", validateBody(authSchemas.verifyEmail), verifyEmail);
router.post("/resend-verification", validateBody(authSchemas.resendVerification), resendVerificationOTP);
router.post("/resend-password-reset", validateBody(authSchemas.resendPasswordReset), resendPasswordResetOTP);

// Protected route for changing password
router.put("/change-password", authenticateToken, changePassword);

export default router;