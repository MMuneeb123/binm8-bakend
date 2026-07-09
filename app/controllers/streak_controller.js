import { UserStreak } from "../models/index.js";
import { successResponse, errorResponse } from "../utils/responseHandler.js";
import { format } from "date-fns";
import {
  getOrCreateStreak as getOrCreateStreakModel,
  recordCollectionForUser,
} from "../services/streak_service.js";

/**
 * Format streak for API response
 */
function formatStreakData(streak) {
  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    totalCollections: streak.totalCollections,
    lastCollectionDate: streak.lastCollectionDate
      ? format(new Date(streak.lastCollectionDate), "yyyy-MM-dd")
      : null,
    streakStartDate: streak.streakStartDate
      ? format(new Date(streak.streakStartDate), "yyyy-MM-dd")
      : null,
  };
}

/**
 * GET /streaks - Get user streak
 */
export async function getStreak(req, res) {
  const userId = req.user.id;
  try {
    const streak = await getOrCreateStreakModel(userId);
    return successResponse(res, formatStreakData(streak));
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

/**
 * POST /streaks/record - Record a collection (update streak)
 * Body: { binId, collectionDate, binType }
 */
export async function recordCollection(req, res) {
  const userId = req.user.id;
  const { collectionDate } = req.body;

  try {
    const result = await recordCollectionForUser(userId, collectionDate);
    return successResponse(res, {
      currentStreak: result.currentStreak,
      streakMaintained: result.streakMaintained,
      milestoneReached: result.milestoneReached,
      achievements: [],
    }, "Collection recorded successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

/**
 * POST /streaks/sync - Sync local streak with server (merge)
 * Body: { localStreak, localLastCollectionDate, localTotalCollections, localLongestStreak }
 */
export async function syncStreak(req, res) {
  const userId = req.user.id;
  const {
    localStreak,
    localLastCollectionDate,
    localTotalCollections,
    localLongestStreak,
  } = req.body;

  try {
    const streak = await getOrCreateStreakModel(userId);

    const serverLast = streak.lastCollectionDate
      ? new Date(streak.lastCollectionDate)
      : null;
    const localLast = localLastCollectionDate
      ? new Date(localLastCollectionDate)
      : null;

    // Take the higher total and longest; for current streak, take the one with the more recent last date
    const totalCollections = Math.max(
      streak.totalCollections,
      localTotalCollections || 0
    );
    const longestStreak = Math.max(
      streak.longestStreak,
      localLongestStreak || 0
    );

    let currentStreak = streak.currentStreak;
    let lastCollectionDate = streak.lastCollectionDate;
    let streakStartDate = streak.streakStartDate;

    if (localLast && (!serverLast || localLast > serverLast)) {
      currentStreak = localStreak || 0;
      lastCollectionDate = format(localLast, "yyyy-MM-dd");
      streakStartDate = lastCollectionDate; // Simplified; could derive from local data if provided
    } else if (serverLast && (!localLast || serverLast >= localLast)) {
      currentStreak = streak.currentStreak;
      lastCollectionDate = streak.lastCollectionDate;
      streakStartDate = streak.streakStartDate;
    }

    await streak.update({
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
      totalCollections,
      lastCollectionDate,
      streakStartDate,
    });

    return successResponse(res, formatStreakData(await streak.reload()));
  } catch (error) {
    return errorResponse(res, error.message);
  }
}
