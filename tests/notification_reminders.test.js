import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { reminderUtcInstant } from "../app/services/reminder_schedule_service.js";
import {
  deliverDueRemindersForBin,
  reminderTransport,
  sendPushNotification,
  setTestMode,
} from "../app/services/notification_delivery.js";

describe("sendPushNotification", () => {
  const originalSend = reminderTransport.send.bind(reminderTransport);

  afterEach(() => {
    reminderTransport.send = originalSend;
  });

  it("returns ok:true when transport succeeds", async () => {
    reminderTransport.send = async () => "mid";
    const bin = {
      binType: "general",
      nextCollectionDate: new Date("2026-06-15T00:00:00.000Z"),
      User: {
        id: 1,
        deviceToken: "tok",
        email: "u@test.com",
      },
    };
    const r = await sendPushNotification(bin, {
      offsetDays: 0,
      collectionYmd: "2026-06-15",
    });
    assert.equal(r.ok, true);
  });

  it("returns ok:false on transport error without marking invalid", async () => {
    reminderTransport.send = async () => {
      const e = new Error("unavailable");
      e.code = "unavailable";
      throw e;
    };
    const bin = {
      binType: "general",
      nextCollectionDate: new Date("2026-06-15T00:00:00.000Z"),
      User: {
        id: 1,
        deviceToken: "tok",
        email: "u@test.com",
        update: async () => {
          throw new Error("should not clear token");
        },
      },
    };
    const r = await sendPushNotification(bin, {
      offsetDays: 0,
      collectionYmd: "2026-06-15",
    });
    assert.equal(r.ok, false);
    assert.equal(r.retryable, true);
    assert.equal(bin.User.deviceToken, "tok");
  });

  it("clears token and returns invalidToken on invalid-registration-token", async () => {
    reminderTransport.send = async () => {
      const e = new Error("bad token");
      e.code = "messaging/invalid-registration-token";
      throw e;
    };
    let cleared = false;
    const bin = {
      binType: "general",
      nextCollectionDate: new Date("2026-06-15T00:00:00.000Z"),
      User: {
        id: 1,
        deviceToken: "bad",
        email: "u@test.com",
        async update(fields) {
          cleared = true;
          if (fields.deviceToken === null) this.deviceToken = null;
        },
      },
    };
    const r = await sendPushNotification(bin, {
      offsetDays: 0,
      collectionYmd: "2026-06-15",
    });
    assert.equal(r.ok, false);
    assert.equal(r.invalidToken, true);
    assert.equal(cleared, true);
    assert.equal(bin.User.deviceToken, null);
  });
});

describe("deliverDueRemindersForBin", () => {
  const originalSend = reminderTransport.send.bind(reminderTransport);
  let testModeWas;

  beforeEach(() => {
    testModeWas = process.env.NOTIFICATION_TEST_MODE;
    process.env.NOTIFICATION_TEST_MODE = "true";
    setTestMode(true);
  });

  afterEach(() => {
    reminderTransport.send = originalSend;
    if (testModeWas === undefined) {
      delete process.env.NOTIFICATION_TEST_MODE;
    } else {
      process.env.NOTIFICATION_TEST_MODE = testModeWas;
    }
    setTestMode(process.env.NOTIFICATION_TEST_MODE === "true");
  });

  it("does not persist keys when transport fails", async () => {
    reminderTransport.send = async () => {
      const e = new Error("fail");
      e.code = "internal";
      throw e;
    };

    const fireAt = reminderUtcInstant("2026-06-15", "12:00", "UTC");
    const bin = {
      id: 42,
      binType: "general",
      nextCollectionDate: new Date("2026-06-15T00:00:00.000Z"),
      reminderSentKeys: {},
      reminderRules: [
        { id: "r1", enabled: true, daysBeforeCollection: 0, time: "12:00" },
      ],
      User: {
        id: 1,
        deviceToken: "tok",
        timezone: "UTC",
        email: "u@test.com",
        collectionReminders: [],
      },
    };

    const { sentCount, keysToPersist } = await deliverDueRemindersForBin(
      bin,
      fireAt
    );
    assert.equal(sentCount, 0);
    assert.equal(keysToPersist, null);
  });

  it("returns keysToPersist when transport succeeds", async () => {
    reminderTransport.send = async () => "ok";

    const fireAt = reminderUtcInstant("2026-06-15", "12:00", "UTC");
    const bin = {
      id: 43,
      binType: "general",
      nextCollectionDate: new Date("2026-06-15T00:00:00.000Z"),
      reminderSentKeys: {},
      reminderRules: [
        { id: "r1", enabled: true, daysBeforeCollection: 0, time: "12:00" },
      ],
      User: {
        id: 1,
        deviceToken: "tok",
        timezone: "UTC",
        email: "u@test.com",
        collectionReminders: [],
      },
    };

    const { sentCount, keysToPersist } = await deliverDueRemindersForBin(
      bin,
      fireAt
    );
    assert.equal(sentCount, 1);
    assert.ok(keysToPersist);
    const keys = Object.keys(keysToPersist);
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^2026-06-15_d0_12:00_/);
  });

  it("does not add key when token is invalid", async () => {
    reminderTransport.send = async () => {
      const e = new Error("bad");
      e.code = "messaging/registration-token-not-registered";
      throw e;
    };

    const fireAt = reminderUtcInstant("2026-06-15", "12:00", "UTC");
    const bin = {
      id: 44,
      binType: "general",
      nextCollectionDate: new Date("2026-06-15T00:00:00.000Z"),
      reminderSentKeys: {},
      reminderRules: [
        { id: "r1", enabled: true, daysBeforeCollection: 0, time: "12:00" },
      ],
      User: {
        id: 1,
        deviceToken: "gone",
        timezone: "UTC",
        email: "u@test.com",
        collectionReminders: [],
        async update(fields) {
          if (fields.deviceToken === null) this.deviceToken = null;
        },
      },
    };

    const { sentCount, keysToPersist } = await deliverDueRemindersForBin(
      bin,
      fireAt
    );
    assert.equal(sentCount, 0);
    assert.equal(keysToPersist, null);
    assert.equal(bin.User.deviceToken, null);
  });
});
