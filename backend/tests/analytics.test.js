const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateMetrics,
  periodBounds,
  previousPeriodBounds,
  growth,
  freshness,
  artistMomentum,
  releaseMovement,
  artistState
} = require("../utils/analytics");

const now = new Date("2026-09-07T00:00:00Z");

test("calculates period metrics and distinct listeners from real event identities", () => {
  const metrics = calculateMetrics([
    { event_type: "play", user_id: 1, value: 1 },
    { event_type: "play", user_id: 1, value: 1 },
    { event_type: "play", session_id: "abc", value: 1 },
    { event_type: "like", user_id: 2, value: 1 },
    { event_type: "download", user_id: 3, value: 2 }
  ]);
  assert.deepEqual(metrics, { plays: 3, views: 0, downloads: 2, likes: 1, distinctListeners: 2 });
});

test("compares equivalent periods and handles zero previous activity safely", () => {
  assert.deepEqual(growth(100, 50), { current: 100, previous: 50, percentage: 100, state: "compared" });
  assert.deepEqual(growth(3, 0), { current: 3, previous: 0, state: "new" });
  assert.deepEqual(growth(0, 0), { current: 0, previous: 0, state: "first activity" });
});

test("calculates freshness and centralized movement scores", () => {
  assert.equal(freshness("2026-09-02T00:00:00Z", now), 5 / 6);
  assert.equal(artistMomentum({ plays: 10, distinctListeners: 2, followerGrowth: 4, likes: 3, downloads: 5, recencyBonus: 1 }), 38.5);
  assert.equal(releaseMovement({ plays: 10, views: 5, downloads: 2, likes: 4, freshnessScore: 1 }), 25);
});

test("returns registered, activated, and active artist states", () => {
  assert.equal(artistState({ artistExists: true, hasUsableProfile: false, publishedReleaseCount: 0 }), "registered");
  assert.equal(artistState({ artistExists: true, hasUsableProfile: true, publishedReleaseCount: 1, recentEngagement: false }), "activated");
  assert.equal(artistState({ artistExists: true, hasUsableProfile: true, publishedReleaseCount: 1, recentEngagement: true }), "active");
});

test("builds seven-day and thirty-day equivalent period windows", () => {
  const sevenDay = periodBounds(7, now);
  const previousSevenDay = previousPeriodBounds(7, now);
  const thirtyDay = periodBounds(30, now);
  assert.equal((sevenDay.end - sevenDay.start) / (24 * 60 * 60 * 1000), 7);
  assert.equal((previousSevenDay.end - previousSevenDay.start) / (24 * 60 * 60 * 1000), 7);
  assert.equal((thirtyDay.end - thirtyDay.start) / (24 * 60 * 60 * 1000), 30);
  assert.equal(previousSevenDay.end.toISOString(), sevenDay.start.toISOString());
});