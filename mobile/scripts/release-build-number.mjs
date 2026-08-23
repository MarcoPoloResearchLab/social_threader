// @ts-check

const releaseEpochMilliseconds = Date.UTC(2020, 0, 1);
const maximumStoreBuildNumber = 2_100_000_000;

/**
 * @param {string} timestamp
 * @returns {number}
 */
export function releaseBuildNumber(timestamp) {
  if (typeof timestamp !== "string" || !timestamp || timestamp.trim() !== timestamp) {
    throw new TypeError("release timestamp must be canonical UTC RFC 3339 text");
  }
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError("release timestamp must be canonical UTC RFC 3339 text");
  }
  const canonicalTimestamp = new Date(milliseconds).toISOString().replace(".000Z", "Z");
  if (canonicalTimestamp !== timestamp.replace(".000Z", "Z")) {
    throw new TypeError("release timestamp must be canonical UTC RFC 3339 text");
  }
  const buildNumber = Math.floor((milliseconds - releaseEpochMilliseconds) / 1000);
  if (buildNumber <= 0 || buildNumber > maximumStoreBuildNumber) {
    throw new RangeError("release timestamp cannot produce a store build number");
  }
  return buildNumber;
}
