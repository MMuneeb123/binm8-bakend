import express from "express";
import { getStreak, recordCollection, syncStreak } from "../controllers/streak_controller.js";
import { authenticateToken } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { streakSchemas } from "../validations/schemas.js";

const router = express.Router();

router.use(authenticateToken);

router.get("/", getStreak);
router.post("/record", validateBody(streakSchemas.record), recordCollection);
router.post("/sync", validateBody(streakSchemas.sync), syncStreak);

export default router;
