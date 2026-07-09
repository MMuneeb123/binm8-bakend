/**
 * User profile uses DB column `timezone` (snake-friendly).
 * API responses also include camelCase `timeZone` (same value) for mobile clients.
 */

export function attachTimezoneAliases(userPayload) {
  if (!userPayload || typeof userPayload !== "object") return userPayload;
  const tz = userPayload.timezone || "Europe/London";
  return { ...userPayload, timezone: tz, timeZone: tz };
}

/** Read IANA zone from body: prefer explicit `timezone`, else `timeZone`. */
export function readTimeZoneFromBody(body) {
  if (!body || typeof body !== "object") return undefined;
  if (body.timezone !== undefined) return body.timezone;
  if (body.timeZone !== undefined) return body.timeZone;
  return undefined;
}

/** If both keys present and differ after trim, return error message string; else null. */
export function conflictingTimeZoneKeys(body) {
  if (!body || typeof body !== "object") return null;
  if (body.timezone === undefined || body.timeZone === undefined) return null;
  const a = String(body.timezone).trim();
  const b = String(body.timeZone).trim();
  if (a && b && a !== b) {
    return "timezone and timeZone must match when both are sent";
  }
  return null;
}
