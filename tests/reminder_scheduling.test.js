import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reminderLocalYmd,
  reminderUtcInstant,
  collectionDateYmd,
  validateCollectionReminders,
  isValidIanaTimezone,
} from "../app/services/reminder_schedule_service.js";
import {
  validateAndNormalizeBinReminderRules,
  MAX_DAYS_BEFORE_COLLECTION,
} from "../app/services/bin_reminder_rules_service.js";
import { getReminderQueryWindow } from "../app/services/reminder_query_window.js";
import { normalizeHHmm } from "../app/utils/time_format.js";

describe("reminderLocalYmd (UTC calendar offset from collection day)", () => {
  it("subtracts 30 days across month boundary", () => {
    assert.equal(reminderLocalYmd("2026-03-15", -30), "2026-02-13");
  });

  it("day before collection", () => {
    assert.equal(reminderLocalYmd("2026-06-01", -1), "2026-05-31");
  });
});

describe("reminderUtcInstant (user zone → UTC)", () => {
  it("maps London wall time on winter date", () => {
    const utc = reminderUtcInstant("2026-01-15", "07:00", "Europe/London");
    assert.ok(utc);
    assert.equal(utc.toISOString(), "2026-01-15T07:00:00.000Z");
  });

  it("BST: 07:00 local on summer date is 06:00Z", () => {
    const utc = reminderUtcInstant("2026-07-15", "07:00", "Europe/London");
    assert.ok(utc);
    assert.equal(utc.toISOString(), "2026-07-15T06:00:00.000Z");
  });

  it("DST spring-forward: 12:00 on Europe/London exists on 2026-03-29", () => {
    const utc = reminderUtcInstant("2026-03-29", "12:00", "Europe/London");
    assert.ok(utc);
    assert.match(utc.toISOString(), /^2026-03-29T11:00:00/);
  });

  it("midnight boundary: 00:30 Tokyo on reminder calendar day maps to previous UTC date", () => {
    const ymd = reminderLocalYmd("2026-04-10", -1);
    assert.equal(ymd, "2026-04-09");
    const utc = reminderUtcInstant(ymd, "00:30", "Asia/Tokyo");
    assert.ok(utc);
    assert.equal(utc.toISOString(), "2026-04-08T15:30:00.000Z");
  });
});

describe("collectionDateYmd + schedule shift", () => {
  it("normalizes nextCollectionDate to UTC YMD", () => {
    const d = new Date(Date.UTC(2026, 5, 3, 23, 59, 0));
    assert.equal(collectionDateYmd(d), "2026-06-03");
  });
});

describe("validateCollectionReminders offset range", () => {
  it("accepts offset -30", () => {
    assert.doesNotThrow(() =>
      validateCollectionReminders([
        { enabled: true, offsetDays: -30, localTime: "09:00" },
      ])
    );
  });

  it("rejects offset below -30", () => {
    assert.throws(() =>
      validateCollectionReminders([
        { enabled: true, offsetDays: -31, localTime: "09:00" },
      ])
    );
  });
});

describe("getReminderQueryWindow", () => {
  it("extends end by MAX_DAYS_BEFORE_COLLECTION + 1 calendar days", () => {
    const now = new Date(Date.UTC(2026, 5, 10, 12, 0, 0));
    const { windowStart, windowEnd } = getReminderQueryWindow(now);
    assert.ok(windowStart <= windowEnd);
    const spanMs = windowEnd.getTime() - windowStart.getTime();
    const days = spanMs / (86400 * 1000);
    assert.ok(days >= MAX_DAYS_BEFORE_COLLECTION);
  });
});

describe("normalizeHHmm", () => {
  it("pads single-digit hour", () => {
    assert.equal(normalizeHHmm("7:05"), "07:05");
  });
});

describe("isValidIanaTimezone (Luxon)", () => {
  it("accepts Europe/London", () => {
    assert.equal(isValidIanaTimezone("Europe/London"), true);
  });

  it("rejects invalid zone strings", () => {
    assert.equal(isValidIanaTimezone("Not/A_Zone"), false);
  });
});

describe("bin reminder rules", () => {
  it("allows daysBeforeCollection up to MAX", () => {
    const rules = [
      { enabled: true, daysBeforeCollection: MAX_DAYS_BEFORE_COLLECTION, time: "08:00" },
    ];
    const out = validateAndNormalizeBinReminderRules(rules);
    assert.equal(out[0].daysBeforeCollection, MAX_DAYS_BEFORE_COLLECTION);
  });

  it("rejects duplicate (daysBefore, time)", () => {
    assert.throws(() =>
      validateAndNormalizeBinReminderRules([
        { daysBeforeCollection: 1, time: "09:00" },
        { daysBeforeCollection: 1, time: "09:00" },
      ])
    );
  });
});
