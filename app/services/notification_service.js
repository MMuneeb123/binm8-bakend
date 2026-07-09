import { UserBin, User } from "../models/index.js";
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

    for (const bin of bins) {
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

    if (sentCount > 0) {
      console.log(`✨ Reminder tick completed: ${sentCount} notification(s) sent`);
    }
  } catch (error) {
    console.error("❌ Error checking collections:", error);
    console.error(error.stack);
  }
}

/**
 * Trigger one-off catch-up delivery for a user right after token re-registration.
 * Uses a 60-minute lookback window and existing idempotency keys.
 */
export async function triggerCatchUpForUser(userId, now = new Date()) {
  try {
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
