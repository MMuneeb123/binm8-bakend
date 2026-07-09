import { User, UserBin } from "../models/index.js";
import { Op } from "sequelize";
import { addDays, format, startOfDay, isAfter, isSameDay } from "date-fns";
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse,
  badRequestResponse,
} from "../utils/responseHandler.js";
import { findNextNonHolidayDate } from "../utils/holidayUtils.js";
import { calculateAndUpdateCollectionDates } from "../services/collection_date_service.js";
import { recordCollectionForUser } from "../services/streak_service.js";
import { validateAndNormalizeBinReminderRules } from "../services/bin_reminder_rules_service.js";

// Add a new bin for user
export async function addUserBin(req, res) {
  const {
    binType,
    bodyColor,
    headColor,
    lastCollectionDate,
    collectionInterval,
    notifyDaysBefore,
    reminderRules,
  } = req.body;

  const userId = req.user.id;

  try {
    // Validate bin type
    if (!["recycle", "garden", "general"].includes(binType)) {
      return badRequestResponse(
        res,
        "Invalid bin type. Must be one of: recycle, garden, general"
      );
    }

    // Check if user already has this bin type
    const existingBin = await UserBin.findOne({
      where: {
        userId,
        binType,
      },
    });
    if (existingBin) {
      return badRequestResponse(res, `User already has a ${binType} bin`);
    }

    // Validate last collection date
    if (!lastCollectionDate || isNaN(new Date(lastCollectionDate))) {
      return badRequestResponse(res, "Invalid last collection date");
    }

    // Validate collection interval
    if (
      !collectionInterval ||
      isNaN(collectionInterval) ||
      collectionInterval <= 0
    ) {
      return badRequestResponse(
        res,
        "Collection interval must be a positive number"
      );
    }

    // Validate colors (accept 6 hex digits with or without #)
    const hexPattern = /^(#?[0-9A-F]{6})$/i;
    if (!hexPattern.test(String(bodyColor).trim()) || !hexPattern.test(String(headColor).trim())) {
      return badRequestResponse(
        res,
        "Body and head colors must be valid hex color codes (e.g. #808080 or 808080)"
      );
    }

    // Check if last collection date is in the future (compare dates only, not times)
    const lastCollectionDateOnly = startOfDay(new Date(lastCollectionDate));
    const todayOnly = startOfDay(new Date());
    if (isAfter(lastCollectionDateOnly, todayOnly)) {
      return badRequestResponse(
        res,
        "Last collection date cannot be in the future"
      );
    }

    // Check if collection interval is valid
    if (collectionInterval <= 0) {
      return badRequestResponse(
        res,
        "Collection interval must be a positive number"
      );
    }

    // check that the last collection date is not 30 days in the past
    const thirtyDaysAgo = startOfDay(addDays(new Date(), -30));
    if (isAfter(thirtyDaysAgo, lastCollectionDateOnly)) {
      return badRequestResponse(
        res,
        "Last collection date cannot be more than 30 days in the past"
      );
    }

    // check if last collection date + collection interval is not in the past (compare dates only)
    const lastCollectionWithInterval = startOfDay(addDays(
      new Date(lastCollectionDate),
      collectionInterval
    ));
    if (isAfter(todayOnly, lastCollectionWithInterval)) {
      return badRequestResponse(
        res,
        "Last collection date plus collection interval cannot be in the past"
      );
    }

    // Calculate next collection date, skipping holidays
    const initialNextDate = addDays(
      new Date(lastCollectionDate),
      collectionInterval
    );
    const nextCollectionDate = await findNextNonHolidayDate(
      initialNextDate,
      req.user.country
    );

    // Normalize hex colors (accept with or without #)
    const normBody = bodyColor.startsWith("#") ? bodyColor : `#${bodyColor}`;
    const normHead = headColor.startsWith("#") ? headColor : `#${headColor}`;

    const createPayload = {
      userId,
      binType,
      bodyColor: normBody,
      headColor: normHead,
      lastCollectionDate,
      collectionInterval,
      nextCollectionDate,
      notifyDaysBefore: notifyDaysBefore ?? 1,
    };

    if (reminderRules !== undefined) {
      try {
        createPayload.reminderRules =
          validateAndNormalizeBinReminderRules(reminderRules);
      } catch (e) {
        return badRequestResponse(res, e.message || "Invalid reminderRules");
      }
    }

    const userBin = await UserBin.create(createPayload);

    return createdResponse(res, userBin, "Bin is added");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}
// Update bin collection schedule
export async function updateBinSchedule(req, res) {
  const { id } = req.params;
  const { lastCollectionDate, collectionInterval, reminderRules } = req.body;
  const userId = req.user.id;

  try {
    const userBin = await UserBin.findOne({
      where: { id, userId },
    });

    if (!userBin) {
      return notFoundResponse(res, "Bin not found");
    }

    // Validate last collection date
    if (!lastCollectionDate || isNaN(new Date(lastCollectionDate))) {
      return badRequestResponse(res, "Invalid last collection date");
    }

    // Validate collection interval
    if (
      !collectionInterval ||
      isNaN(collectionInterval) ||
      collectionInterval <= 0
    ) {
      return badRequestResponse(
        res,
        "Collection interval must be a positive number"
      );
    }

    // Check if last collection date is in the future (compare dates only, not times)
    const lastCollectionDateOnly = startOfDay(new Date(lastCollectionDate));
    const todayOnly = startOfDay(new Date());
    if (isAfter(lastCollectionDateOnly, todayOnly)) {
      return badRequestResponse(
        res,
        "Last collection date cannot be in the future"
      );
    }

    // Check if collection interval is valid
    if (collectionInterval <= 0) {
      return badRequestResponse(
        res,
        "Collection interval must be a positive number"
      );
    }

    // check that the last collection date is not 30 days in the past
    const thirtyDaysAgo = startOfDay(addDays(new Date(), -30));
    if (isAfter(thirtyDaysAgo, lastCollectionDateOnly)) {
      return badRequestResponse(
        res,
        "Last collection date cannot be more than 30 days in the past"
      );
    }

    // check if the last collection date + collection interval is not in the past (compare dates only)
    const lastCollectionWithInterval = startOfDay(addDays(
      new Date(lastCollectionDate),
      collectionInterval
    ));
    if (isAfter(todayOnly, lastCollectionWithInterval)) {
      return badRequestResponse(
        res,
        "Last collection date plus collection interval cannot be in the past"
      );
    }
    // Update collection schedule
    const initialNextDate = addDays(
      new Date(lastCollectionDate),
      collectionInterval
    );
    const nextCollectionDate = await findNextNonHolidayDate(
      initialNextDate,
      req.user.country
    );

    const updates = {
      lastCollectionDate,
      collectionInterval,
      nextCollectionDate,
    };

    if (reminderRules !== undefined) {
      try {
        updates.reminderRules =
          validateAndNormalizeBinReminderRules(reminderRules);
      } catch (e) {
        return badRequestResponse(res, e.message || "Invalid reminderRules");
      }
    }

    await userBin.update({
      ...updates,
      reminderSentKeys: {},
    });

    await userBin.reload();
    return successResponse(res, userBin);
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

/** PUT /bins/:id/reminders — replace entire reminderRules array (use [] for none) */
export async function replaceBinReminderRules(req, res) {
  const binId = parseInt(req.params.id, 10);
  const userId = req.user.id;
  const { reminderRules } = req.body;

  if (Number.isNaN(binId) || binId < 1) {
    return badRequestResponse(res, "Invalid bin ID");
  }

  try {
    const userBin = await UserBin.findOne({
      where: { id: binId, userId },
    });

    if (!userBin) {
      return notFoundResponse(res, "Bin not found");
    }

    let normalized;
    try {
      normalized = validateAndNormalizeBinReminderRules(reminderRules);
    } catch (e) {
      return badRequestResponse(res, e.message || "Invalid reminderRules");
    }

    await userBin.update({
      reminderRules: normalized,
      reminderSentKeys: {},
    });
    await userBin.reload();

    return successResponse(res, userBin, "Reminder rules updated");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Update bin appearance
export async function updateBinAppearance(req, res) {
  const { id } = req.params;
  const { bodyColor, headColor } = req.body;
  const userId = req.user.id;

  try {
    const userBin = await UserBin.findOne({
      where: { id, userId },
    });

    if (!userBin) {
      return notFoundResponse(res, "Bin not found");
    }

    // check they are not number and are valid hex colors
    if (
      !/^#[0-9A-F]{6}$/i.test(bodyColor) ||
      !/^#[0-9A-F]{6}$/i.test(headColor)
    ) {
      return badRequestResponse(
        res,
        "Body and head colors must be valid hex color codes"
      );
    }

    await userBin.update({ bodyColor, headColor });
    return successResponse(res, userBin);
  } catch (error) {
    return errorResponse(res, error.message);
  }
}
// Get user's bins
export async function getUserBins(req, res) {
  const userId = req.user.id;

  try {
    // Fetch user data for country/holiday lookup
    const user = await User.findByPk(userId, {
      attributes: ["id", "country"],
    });

    if (!user) {
      return errorResponse(res, "User not found");
    }

    // Fetch all user bins
    const userBins = await UserBin.findAll({
      where: { userId },
      order: [["nextCollectionDate", "ASC"]],
    });

    // Update collection dates for bins where nextCollectionDate has passed
    const today = startOfDay(new Date());
    const updatePromises = userBins.map(async (bin) => {
      const nextCollectionDate = startOfDay(new Date(bin.nextCollectionDate));
      
      // Only update if nextCollectionDate is today or in the past
      if (isSameDay(nextCollectionDate, today) || isAfter(today, nextCollectionDate)) {
        try {
          await calculateAndUpdateCollectionDates(bin, user);
        } catch (error) {
          // Log error but don't fail the entire request
          console.error(`Failed to update collection dates for bin ${bin.id}:`, error);
        }
      }
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    // Reload bins to get updated data
    const updatedBins = await UserBin.findAll({
      where: { userId },
      order: [["nextCollectionDate", "ASC"]],
    });

    return successResponse(res, updatedBins, null);
  } catch (error) {
    return errorResponse(res, error.message);
  }
}
// Get upcoming collections
export async function getUpcomingCollections(req, res) {
  const userId = req.user.id;
  const { days = 7 } = req.query;

  try {
    // Fetch user data for country/holiday lookup
    const user = await User.findByPk(userId, {
      attributes: ["id", "country"],
    });

    if (!user) {
      return errorResponse(res, "User not found");
    }

    // Fetch all user bins first
    const allUserBins = await UserBin.findAll({
      where: { userId },
      order: [["nextCollectionDate", "ASC"]],
    });

    // Update collection dates for bins where nextCollectionDate has passed
    const today = startOfDay(new Date());
    const updatePromises = allUserBins.map(async (bin) => {
      const nextCollectionDate = startOfDay(new Date(bin.nextCollectionDate));
      
      // Only update if nextCollectionDate is today or in the past
      if (isSameDay(nextCollectionDate, today) || isAfter(today, nextCollectionDate)) {
        try {
          await calculateAndUpdateCollectionDates(bin, user);
        } catch (error) {
          // Log error but don't fail the entire request
          console.error(`Failed to update collection dates for bin ${bin.id}:`, error);
        }
      }
    });

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    // Reload bins to get updated data
    const updatedBins = await UserBin.findAll({
      where: { userId },
      order: [["nextCollectionDate", "ASC"]],
    });

    // Filter for upcoming collections within the specified days
    const endDate = addDays(new Date(), parseInt(days));
    const upcomingCollections = updatedBins.filter((bin) => {
      const nextDate = new Date(bin.nextCollectionDate);
      return nextDate >= new Date() && nextDate <= endDate;
    });

    // Format the response
    const formattedCollections = upcomingCollections.map((bin) => ({
      binType: bin.binType,
      nextCollectionDate: format(bin.nextCollectionDate, "yyyy-MM-dd"),
      daysUntil: Math.ceil(
        (bin.nextCollectionDate - new Date()) / (1000 * 60 * 60 * 24)
      ),
      bodyColor: bin.bodyColor,
      headColor: bin.headColor,
    }));

    return successResponse(res, formattedCollections);
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Delete a bin
export async function deleteUserBin(req, res) {
  const { id: binIdParam } = req.params;
  const userId = req.user.id;

  const binId = parseInt(binIdParam, 10);
  if (Number.isNaN(binId) || binId < 1) {
    return badRequestResponse(res, "Invalid bin ID");
  }

  try {
    const userBin = await UserBin.findOne({
      where: { id: binId, userId },
    });

    if (!userBin) {
      return notFoundResponse(res, "Bin not found");
    }

    await userBin.destroy();
    return successResponse(res, null, "Bin deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Mark bin as collected (Bin Buddy "Mark as collected") - updates bin schedule and streak
export async function markBinCollected(req, res) {
  const { id: binId } = req.params;
  const { collectionDate, markedVia } = req.body;
  const userId = req.user.id;

  try {
    const userBin = await UserBin.findOne({
      where: { id: binId, userId },
    });

    if (!userBin) {
      return notFoundResponse(res, "Bin not found");
    }

    const collectionDateOnly = startOfDay(new Date(collectionDate));
    if (isAfter(collectionDateOnly, startOfDay(new Date()))) {
      return badRequestResponse(res, "Collection date cannot be in the future");
    }

    const initialNextDate = addDays(collectionDateOnly, userBin.collectionInterval);
    const nextCollectionDate = await findNextNonHolidayDate(
      initialNextDate,
      req.user.country
    );

    await userBin.update({
      lastCollectionDate: collectionDateOnly,
      nextCollectionDate,
      reminderSentKeys: {},
    });

    const streakResult = await recordCollectionForUser(userId, collectionDate);

    return successResponse(res, {
      binId: userBin.id,
      lastCollectionDate: format(collectionDateOnly, "yyyy-MM-dd"),
      nextCollectionDate: format(nextCollectionDate, "yyyy-MM-dd"),
      streakUpdated: true,
      newStreak: streakResult.currentStreak,
      achievements: [],
    }, "Collection marked as complete");
  } catch (error) {
    return errorResponse(res, error.message);
  }
}

// Test endpoint to trigger notifications immediately
export async function testNotifications(req, res) {
  try {
    const { checkUpcomingCollections, setTestMode } = await import('../services/notification_service.js');
    
    // Enable test mode
    setTestMode(true);
    
    console.log('🧪 [TEST ENDPOINT] Test notification triggered manually');
    
    // Trigger notification check immediately
    await checkUpcomingCollections();
    
    return successResponse(res, {
      message: "Notification test triggered. Check server logs for details.",
      testMode: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('🧪 [TEST ENDPOINT] Error:', error);
    return errorResponse(res, error.message);
  }
}
