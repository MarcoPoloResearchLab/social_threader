import { releaseBuildNumber } from "../scripts/release-build-number.mjs";

describe("Android release build number", () => {
  it("uses UTC seconds since the release epoch", () => {
    expect(releaseBuildNumber("2026-08-22T00:00:00Z")).toBe(209520000);
  });

  it.each([
    ["", TypeError],
    ["2026-08-22", TypeError],
    ["2019-12-31T23:59:59Z", RangeError],
    ["2086-07-22T02:40:01Z", RangeError]
  ])("rejects %p", (timestamp, expectedError) => {
    expect(() => releaseBuildNumber(timestamp)).toThrow(expectedError);
  });
});
