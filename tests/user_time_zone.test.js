import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  attachTimezoneAliases,
  conflictingTimeZoneKeys,
  readTimeZoneFromBody,
} from "../app/utils/userTimeZone.js";

describe("userTimeZone helpers", () => {
  it("attachTimezoneAliases adds timeZone and default timezone", () => {
    const o = attachTimezoneAliases({ id: 1, email: "a@b.c" });
    assert.equal(o.timezone, "Europe/London");
    assert.equal(o.timeZone, "Europe/London");
  });

  it("readTimeZoneFromBody prefers timezone over timeZone", () => {
    assert.equal(
      readTimeZoneFromBody({ timezone: "UTC", timeZone: "Europe/Paris" }),
      "UTC"
    );
  });

  it("conflictingTimeZoneKeys when values differ", () => {
    const msg = conflictingTimeZoneKeys({
      timezone: "UTC",
      timeZone: "Europe/Paris",
    });
    assert.ok(msg);
  });

  it("conflictingTimeZoneKeys null when only one key", () => {
    assert.equal(conflictingTimeZoneKeys({ timezone: "UTC" }), null);
  });
});
