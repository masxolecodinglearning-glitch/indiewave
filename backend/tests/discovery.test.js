const test = require("node:test");
const assert = require("node:assert/strict");
const { releaseMovement, artistMomentum } = require("../utils/analytics");
const {
  rankRisingArtists,
  rankMovingReleases,
  rankFreshDrops,
  rankMostViewed,
  rankMostDownloaded
} = require("../utils/discovery");

test("recent movement beats stale lifetime popularity when its movement score is higher", () => {
  const stale = { id: 1, listen_count: 50000, movement_score: releaseMovement({}) };
  const moving = { id: 2, listen_count: 10, movement_score: releaseMovement({ plays: 20, likes: 4 }) };
  assert.deepEqual(rankMovingReleases([stale, moving]).map((release) => release.id), [2, 1]);
});

test("rising artists rank by momentum rather than lifetime followers", () => {
  const established = { id: 1, followers: 50000, momentum_score: artistMomentum({}) };
  const rising = { id: 2, followers: 10, momentum_score: artistMomentum({ plays: 20, distinctListeners: 5 }) };
  assert.deepEqual(rankRisingArtists([established, rising]).map((artist) => artist.id), [2, 1]);
});

test("fresh drops use creation time while viewed and downloaded keep lifetime counters", () => {
  const old = { id: 1, created_at: "2026-08-01T00:00:00Z", view_count: 100, video_view_count: 0, download_count: 100 };
  const fresh = { id: 2, created_at: "2026-09-06T00:00:00Z", view_count: 1, video_view_count: 0, download_count: 1 };
  assert.deepEqual(rankFreshDrops([old, fresh]).map((release) => release.id), [2, 1]);
  assert.deepEqual(rankMostViewed([old, fresh]).map((release) => release.id), [1, 2]);
  assert.deepEqual(rankMostDownloaded([old, fresh]).map((release) => release.id), [1, 2]);
});

test("no activity produces no artificial movement or artist momentum", () => {
  assert.equal(releaseMovement({}), 0);
  assert.equal(releaseMovement({ freshnessScore: 1 }), 1);
  assert.equal(artistMomentum({}), 0);
  assert.deepEqual(rankMovingReleases([{ id: 1, movement_score: 0 }]).map((release) => release.id), [1]);
});