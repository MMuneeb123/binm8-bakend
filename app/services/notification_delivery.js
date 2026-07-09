import { format } from "date-fns";
import {
  collectionDateYmd,
  reminderLocalYmd,
  reminderUtcInstant,
  isSameMinute,
} from "./reminder_schedule_service.js";
import {
  getSchedulingRemindersForBin,
  buildBinSchedulerKey,
} from "./bin_reminder_rules_service.js";

let TEST_MODE = process.env.NOTIFICATION_TEST_MODE === "true";

export function setTestMode(enabled) {
  TEST_MODE = enabled;
  console.log(
    `🧪 Notification test mode: ${enabled ? "ENABLED" : "DISABLED"}`
  );
}

/**
 * Pluggable FCM send (default: Firebase Admin). Tests may replace `send` only.
 */
export const reminderTransport = {
  /** Dynamic import avoids loading firebase-admin during unit tests that mock `send`. */
  async send(message) {
    const { messaging } = await import("../config/firebase.js");
    if (!messaging) {
      const err = new Error("Firebase messaging not configured");
      err.code = "messaging_unconfigured";
      throw err;
    }
    return messaging.send(message);
  },
};

function pruneSentKeysForCollection(reminderSentKeys, collectionYmd) {
  const o =
    reminderSentKeys && typeof reminderSentKeys === "object"
      ? { ...reminderSentKeys }
      : {};
  for (const k of Object.keys(o)) {
    if (!k.startsWith(`${collectionYmd}_`)) {
      delete o[k];
    }
  }
  return o;
}

function reminderBody(bin, collectionYmd, offsetDays) {
  const type = bin.binType;
  if (offsetDays === 0) {
    return `Final reminder: Your ${type} bin will be collected today!`;
  }
  if (offsetDays === -1) {
    return `Your ${type} bin will be collected tomorrow.`;
  }
  const daysUntil = -offsetDays;
  return `Reminder: Your ${type} bin will be collected in ${daysUntil} days (${collectionYmd}).`;
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, code?: string, invalidToken?: boolean, retryable?: boolean }>}
 */
export async function sendPushNotification(bin, meta = {}) {
  const { User: user } = bin;
  const { offsetDays = -1, collectionYmd } = meta;
  const collectionDateStr =
    collectionYmd || format(new Date(bin.nextCollectionDate), "yyyy-MM-dd");

  const body = reminderBody(bin, collectionDateStr, offsetDays);

  const message = {
    token: user.deviceToken,
    notification: {
      title: "Bin Collection Reminder",
      body,
    },
    data: {
      binType: bin.binType,
      bodyColor: bin.bodyColor,
      headColor: bin.headColor,
      collectionDate: bin.nextCollectionDate.toISOString(),
      type: "collection_reminder",
      offsetDays: String(offsetDays),
    },
    android: {
      priority: "high",
      notification: {
        channelId: "bin_collections",
        sound: "default",
        priority: "high",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    apns: {
      payload: {
        aps: {
          sound: "default",
          badge: 1,
        },
      },
    },
  };

  try {
    await reminderTransport.send(message);
    console.log("Successfully sent notification");
    return { ok: true };
  } catch (error) {
    console.error("Error sending notification:", error);
    const invalid =
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered";
    if (invalid) {
      await user.update({ deviceToken: null });
      if (bin.User) bin.User.deviceToken = null;
      console.log("Removed invalid device token for user:", user.id);
      return { ok: false, code: error.code, invalidToken: true, retryable: false };
    }
    return {
      ok: false,
      code: error.code || "unknown",
      retryable: true,
    };
  }
}

/**
 * Evaluate due slots and send FCM for one bin. Does not persist.
 * @returns {Promise<{ sentCount: number, keysToPersist: Record<string, string> | null }>}
 */
export async function deliverDueRemindersForBin(bin, now = new Date()) {
  return deliverRemindersForBinInternal(bin, now);
}

/**
 * Evaluate recently missed slots and send catch-up FCM for one bin.
 * Does not persist.
 * @returns {Promise<{ sentCount: number, keysToPersist: Record<string, string> | null }>}
 */
export async function deliverCatchUpRemindersForBin(
  bin,
  now = new Date(),
  lookbackMs = 60 * 60 * 1000
) {
  return deliverRemindersForBinInternal(bin, now, { catchUpWindowMs: lookbackMs });
}

async function deliverRemindersForBinInternal(
  bin,
  now,
  options = {}
) {
  const { catchUpWindowMs = null } = options;
  const user = bin.User;
  if (!user?.deviceToken) {
    return { sentCount: 0, keysToPersist: null };
  }

  const slots = getSchedulingRemindersForBin(bin, user);
  if (slots.length === 0) {
    return { sentCount: 0, keysToPersist: null };
  }

  const tz = (user.timezone && String(user.timezone).trim()) || "Europe/London";
  const collectionYmd = collectionDateYmd(bin.nextCollectionDate);
  let sentKeys = pruneSentKeysForCollection(
    bin.reminderSentKeys || {},
    collectionYmd
  );
  let sentCount = 0;

  for (const slot of slots) {
    if (!bin.User?.deviceToken) {
      break;
    }

    if (!slot.enabled) continue;

    const offsetDays = slot.offsetDays;
    const localTime = slot.localTime;
    const daysBefore = -offsetDays;
    const key = buildBinSchedulerKey(
      collectionYmd,
      daysBefore,
      localTime,
      slot.ruleId
    );

    if (sentKeys[key]) {
      continue;
    }

    const reminderYmd = reminderLocalYmd(collectionYmd, offsetDays);
    const instant = reminderUtcInstant(reminderYmd, localTime, tz);
    if (!instant) {
      console.warn(
        `⚠️  Bad reminder instant for bin ${bin.id} key ${key} ruleId=${slot.ruleId ?? "n/a"}`
      );
      continue;
    }

    let shouldSend = false;
    if (catchUpWindowMs !== null) {
      const lagMs = now - instant;
      shouldSend = lagMs >= 0 && lagMs <= catchUpWindowMs;
    } else if (TEST_MODE) {
      const diffMs = Math.abs(now - instant);
      shouldSend = isSameMinute(now, instant) || diffMs < 120 * 1000;
    } else {
      shouldSend = isSameMinute(now, instant);
    }

    if (!shouldSend) {
      continue;
    }

    console.log(
      `${catchUpWindowMs !== null ? "🔁" : "📤"} Sending ${
        catchUpWindowMs !== null ? "catch-up " : ""
      }reminder ${key} for bin ${bin.id} (${bin.binType}) → ${user.email}`
    );

    const result = await sendPushNotification(bin, { offsetDays, collectionYmd });
    if (result.ok) {
      sentKeys = { ...sentKeys, [key]: new Date().toISOString() };
      sentCount++;
    }
  }

  if (sentCount === 0) {
    return { sentCount: 0, keysToPersist: null };
  }
  return { sentCount, keysToPersist: sentKeys };
}
