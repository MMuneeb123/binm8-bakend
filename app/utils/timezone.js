import { DateTime } from "luxon";

export function isValidIanaTimezone(tz) {
  if (typeof tz !== "string" || !tz.trim()) return false;
  const zone = tz.trim();
  return DateTime.now().setZone(zone).isValid;
}
