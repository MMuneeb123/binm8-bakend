/**
 * Normalize wall time to HH:mm (24h). Returns null if invalid.
 * @param {unknown} t
 * @returns {string | null}
 */
export function normalizeHHmm(t) {
  const s = String(t).trim();
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) return null;
  const h = String(parseInt(m[1], 10)).padStart(2, "0");
  return `${h}:${m[2]}`;
}
