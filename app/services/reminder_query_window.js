import { MAX_DAYS_BEFORE_COLLECTION } from "./bin_reminder_rules_service.js";

/** Local calendar start-of-day (matches prior `date-fns` `startOfDay` / `addDays` in server TZ). */
function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addLocalDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Local calendar bounds for loading bins from the DB on each cron tick.
 *
 * Invariant: `nextCollectionDate` is compared as a JS Date (typically UTC midnight for the
 * collection calendar day). A rule fires when `reminderUtcInstant(reminderYmd, localTime, tz)`
 * matches the current minute. The latest reminder *calendar day* for allowed rules is
 * `collectionYmd - MAX_DAYS_BEFORE_COLLECTION` (UTC date arithmetic, see `reminderLocalYmd`).
 * We must load any bin whose `nextCollectionDate` could still produce a due slot in the near
 * future. We use `windowStart = startOfLocalDay(now - 2)` for late/catch-up tolerance and
 * `windowEnd = startOfLocalDay(now + MAX_DAYS_BEFORE_COLLECTION + 1)` as a one-day buffer beyond
 * the furthest collection day needed for a "today" reminder at `daysBefore = MAX`.
 */
export function getReminderQueryWindow(now = new Date()) {
  const windowStart = startOfLocalDay(addLocalDays(now, -2));
  const windowEnd = startOfLocalDay(
    addLocalDays(now, MAX_DAYS_BEFORE_COLLECTION + 1)
  );
  return { windowStart, windowEnd };
}
