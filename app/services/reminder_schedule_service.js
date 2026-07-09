import { DateTime } from "luxon";
import { normalizeHHmm } from "../utils/time_format.js";
import { isValidIanaTimezone } from "../utils/timezone.js";

/** Default when `collectionReminders` is null/undefined (legacy behaviour). */
export const DEFAULT_COLLECTION_REMINDERS = [
  { enabled: true, offsetDays: -1, localTime: "18:00" },
  { enabled: true, offsetDays: 0, localTime: "07:00" },
];

export const MIN_OFFSET_DAYS = -30;
export const MAX_REMINDERS = 6;

/**
 * Effective reminders for scheduling & API responses.
 * - null/undefined DB → default two reminders
 * - [] → no reminders (explicit)
 */
export function getEffectiveReminders(user) {
  const raw = user.collectionReminders;
  if (raw === null || raw === undefined) {
    return DEFAULT_COLLECTION_REMINDERS.map((r) => ({ ...r }));
  }
  if (Array.isArray(raw) && raw.length === 0) {
    return [];
  }
  return Array.isArray(raw) ? raw.map((r) => ({ ...r })) : [];
}

/**
 * For GET /users/me: same as effective list (defaults expanded).
 */
export function getRemindersForApiResponse(user) {
  return getEffectiveReminders(user);
}

/**
 * Throws string message on validation error.
 */
export function validateCollectionReminders(reminders) {
  if (!Array.isArray(reminders)) {
    throw new Error("collectionReminders must be an array");
  }
  if (reminders.length > MAX_REMINDERS) {
    throw new Error(`At most ${MAX_REMINDERS} reminders allowed`);
  }

  const seen = new Set();
  for (const r of reminders) {
    if (typeof r.enabled !== "boolean") {
      throw new Error("Each reminder must have enabled: boolean");
    }
    if (
      typeof r.offsetDays !== "number" ||
      !Number.isInteger(r.offsetDays) ||
      r.offsetDays < MIN_OFFSET_DAYS ||
      r.offsetDays > 0
    ) {
      throw new Error(
        `offsetDays must be an integer between ${MIN_OFFSET_DAYS} and 0`
      );
    }
    const lt = normalizeHHmm(r.localTime);
    if (!lt) {
      throw new Error("localTime must be HH:mm (24h)");
    }
    const key = `${r.offsetDays}|${lt}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate reminder: offsetDays ${r.offsetDays} at ${lt}`);
    }
    seen.add(key);
  }
}

export { isValidIanaTimezone };

/**
 * Collection calendar day as YYYY-MM-DD from stored bin.nextCollectionDate.
 */
export function collectionDateYmd(nextCollectionDate) {
  const d = new Date(nextCollectionDate);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Reminder local calendar day = collection YMD + offsetDays (calendar arithmetic, UTC date parts).
 */
export function reminderLocalYmd(collectionYmd, offsetDays) {
  const dt = DateTime.fromISO(collectionYmd, { zone: "utc" })
    .startOf("day")
    .plus({ days: offsetDays });
  return dt.toFormat("yyyy-MM-dd");
}

/**
 * UTC Date for (reminderYmd at localTime in zone).
 */
export function reminderUtcInstant(reminderYmd, localTime, zone) {
  const norm = normalizeHHmm(localTime);
  if (!norm) return null;
  const [hh, mm] = norm.split(":").map((x) => parseInt(x, 10));
  const [y, mo, d] = reminderYmd.split("-").map((x) => parseInt(x, 10));
  const dt = DateTime.fromObject(
    {
      year: y,
      month: mo,
      day: d,
      hour: hh,
      minute: mm,
      second: 0,
      millisecond: 0,
    },
    { zone }
  );
  if (!dt.isValid) return null;
  return dt.toUTC().toJSDate();
}

export function buildReminderKey(collectionYmd, offsetDays, localTime) {
  const lt = normalizeHHmm(localTime) || String(localTime);
  return `${collectionYmd}_${offsetDays}_${lt}`;
}

/**
 * Whether `now` falls in the same minute as `instant` (for cron every minute).
 */
export function isSameMinute(now, instantUtc) {
  const a = DateTime.fromJSDate(now).toUTC();
  const b = DateTime.fromJSDate(instantUtc).toUTC();
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute
  );
}
