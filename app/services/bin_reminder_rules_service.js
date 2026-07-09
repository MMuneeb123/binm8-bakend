import { randomUUID } from "crypto";
import { getEffectiveReminders } from "./reminder_schedule_service.js";
import { normalizeHHmm } from "../utils/time_format.js";

/** Max rules per bin (product cap). */
export const MAX_BIN_REMINDER_RULES = 5;

/** Max calendar days before collection for a rule. */
export const MAX_DAYS_BEFORE_COLLECTION = 30;

/**
 * Validate and normalize rules for storage. Assigns UUID `id` when missing.
 * @throws {Error} validation message
 */
export function validateAndNormalizeBinReminderRules(rules) {
  if (!Array.isArray(rules)) {
    throw new Error("reminderRules must be an array");
  }
  if (rules.length > MAX_BIN_REMINDER_RULES) {
    throw new Error(`At most ${MAX_BIN_REMINDER_RULES} reminder rules per bin`);
  }

  const seen = new Set();
  const out = [];

  for (const r of rules) {
    const enabled = r.enabled !== false;
    const dbc = r.daysBeforeCollection;
    if (typeof dbc !== "number" || !Number.isInteger(dbc) || dbc < 0 || dbc > MAX_DAYS_BEFORE_COLLECTION) {
      throw new Error(
        `daysBeforeCollection must be an integer 0–${MAX_DAYS_BEFORE_COLLECTION}`
      );
    }
    const time = normalizeHHmm(r.time);
    if (!time) {
      throw new Error("time must be HH:mm (24h)");
    }
    const dedupeKey = `${dbc}|${time}`;
    if (seen.has(dedupeKey)) {
      throw new Error(`Duplicate rule: daysBeforeCollection ${dbc} at ${time}`);
    }
    seen.add(dedupeKey);

    let id = r.id;
    if (id != null && id !== "") {
      id = String(id);
    } else {
      id = randomUUID();
    }

    out.push({
      id,
      enabled,
      daysBeforeCollection: dbc,
      time,
    });
  }

  return out;
}

/**
 * Scheduler: normalized slots with offsetDays (negative calendar offset from collection day).
 * - bin.reminderRules == null/undefined → inherit user profile reminders (getEffectiveReminders).
 * - bin.reminderRules === [] → no reminders for this bin.
 * - else → per-bin rules mapped to offsetDays = -daysBeforeCollection.
 */
export function getSchedulingRemindersForBin(bin, user) {
  const raw = bin.reminderRules;

  if (raw === null || raw === undefined) {
    return getEffectiveReminders(user).map((r) => ({
      offsetDays: r.offsetDays,
      localTime: r.localTime,
      enabled: r.enabled !== false,
      ruleId: null,
    }));
  }

  if (Array.isArray(raw) && raw.length === 0) {
    return [];
  }

  if (!Array.isArray(raw)) {
    return [];
  }

  const out = [];
  for (const r of raw) {
    if (
      !r ||
      typeof r.daysBeforeCollection !== "number" ||
      !Number.isInteger(r.daysBeforeCollection) ||
      r.daysBeforeCollection < 0 ||
      r.daysBeforeCollection > MAX_DAYS_BEFORE_COLLECTION
    ) {
      console.warn(
        `[reminders] bin ${bin.id}: dropping rule with invalid daysBeforeCollection`,
        { ruleId: r?.id, daysBeforeCollection: r?.daysBeforeCollection }
      );
      continue;
    }
    const lt = normalizeHHmm(r.time);
    if (!lt) {
      console.warn(`[reminders] bin ${bin.id}: dropping rule with invalid time`, {
        ruleId: r.id,
        time: r.time,
      });
      continue;
    }
    out.push({
      offsetDays: -r.daysBeforeCollection,
      localTime: lt,
      enabled: r.enabled !== false,
      ruleId: r.id != null ? String(r.id) : null,
    });
  }
  return out;
}

/**
 * Stable idempotency key for FCM dedupe. Includes rule id when present.
 */
export function buildBinSchedulerKey(collectionYmd, daysBeforeCollection, time, ruleId) {
  const t = normalizeHHmm(time) || String(time);
  const rid = ruleId ? String(ruleId) : "noid";
  return `${collectionYmd}_d${daysBeforeCollection}_${t}_${rid}`;
}
