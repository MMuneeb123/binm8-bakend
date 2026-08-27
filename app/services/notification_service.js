import { UserBin, User, Subscription } from "../models/index.js";
import { Op } from "sequelize";
import { format } from "date-fns";
import { getReminderQueryWindow } from "./reminder_query_window.js";
import {
  deliverDueRemindersForBin,
  deliverCatchUpRemindersForBin,
  setTestMode,
} from "./notification_delivery.js";

export {
  deliverDueRemindersForBin,
  deliverCatchUpRemindersForBin,
  reminderTransport,
  sendPushNotification,
  setTestMode,
} from "./notification_delivery.js";

export { getReminderQueryWindow } from "./reminder_query_window.js";

/**
 * Check if a user has an active or valid trial subscription
 * @param {number} userId - User ID to check
 * @param {Date} now - Current date/time
 * @returns {Promise<boolean>} True if user has valid subscription
 */
async function hasValidSubscription(userId, now = new Date()) {
  try {
    const subscription = await Subscription.findOne({
      where: {
        userId,
        status: {
          [Op.in]: ["ACTIVE", "TRIAL"], // Active paid or trial users
        },
        endsAt: {
          [Op.gt]: now, // Subscription hasn't expired yet
        },
      },
      order: [["endsAt", "DESC"]], // Get most recent
    });
    return !!subscription;
  } catch (error) {
    console.error(`Error checking subscription for user ${userId}:`, error.message);
    return false; // Default to false if error
  }
}

export async function checkUpcomingCollections() {
  try {
    const now = new Date();
    const { windowStart, windowEnd } = getReminderQueryWindow(now);

    const bins = await UserBin.findAll({
      where: {
        notificationEnabled: true,
        nextCollectionDate: {
          [Op.between]: [windowStart, windowEnd],
        },
      },
      include: [
        {
          model: User,
          attributes: [
            "id",
            "email",
            "country",
            "deviceToken",
            "timezone",
            "collectionReminders",
          ],
        },
      ],
    });

    if (bins.length > 0) {
      console.log(
        `🔔 Reminder tick: ${bins.length} bin(s) in date window (${format(windowStart, "yyyy-MM-dd")} … ${format(windowEnd, "yyyy-MM-dd")})`
      );
    }

    let sentCount = 0;
    let skippedCount = 0;

    for (const bin of bins) {
      // Check if user has valid subscription (ACTIVE or valid TRIAL)
      const hasValid = await hasValidSubscription(bin.User.id, now);
      
      if (!hasValid) {
        console.log(`⏭️  Skipping notification for user ${bin.User.id} - no active subscription or trial expired`);
        skippedCount++;
        continue;
      }

      const { sentCount: n, keysToPersist } = await deliverDueRemindersForBin(
        bin,
        now
      );
      if (keysToPersist) {
        await bin.update({
          reminderSentKeys: keysToPersist,
          lastNotificationTime: new Date(),
        });
        sentCount += n;
      }
    }

    if (sentCount > 0 || skippedCount > 0) {
      console.log(`✨ Reminder tick completed: ${sentCount} sent, ${skippedCount} skipped (no valid subscription)`);
    }
  } catch (error) {
    console.error("❌ Error checking collections:", error);
    console.error(error.stack);
  }
}

/**
 * Trigger one-off catch-up delivery for a user right after token re-registration.
 * Uses a 60-minute lookback window and existing idempotency keys.
 * Only sends if user has valid subscription (ACTIVE or valid TRIAL).
 */
export async function triggerCatchUpForUser(userId, now = new Date()) {
  try {
    // Check if user has valid subscription first
    const hasValid = await hasValidSubscription(userId, now);
    if (!hasValid) {
      console.log(`⏭️  Catch-up skipped for user ${userId} - no active subscription or trial expired`);
      return;
    }

    const { windowStart, windowEnd } = getReminderQueryWindow(now);
    const bins = await UserBin.findAll({
      where: {
        userId,
        notificationEnabled: true,
        nextCollectionDate: {
          [Op.between]: [windowStart, windowEnd],
        },
      },
      include: [
        {
          model: User,
          attributes: [
            "id",
            "email",
            "country",
            "deviceToken",
            "timezone",
            "collectionReminders",
          ],
        },
      ],
    });

    let sentCount = 0;
    for (const bin of bins) {
      const { sentCount: n, keysToPersist } = await deliverCatchUpRemindersForBin(
        bin,
        now
      );
      if (keysToPersist) {
        await bin.update({
          reminderSentKeys: keysToPersist,
          lastNotificationTime: new Date(),
        });
        sentCount += n;
      }
    }

    if (sentCount > 0) {
      console.log(
        `🔁 Catch-up delivery completed for user ${userId}: ${sentCount} notification(s) sent`
      );
    }
  } catch (error) {
    console.error(`❌ Error in catch-up delivery for user ${userId}:`, error);
    console.error(error.stack);
  }
}
