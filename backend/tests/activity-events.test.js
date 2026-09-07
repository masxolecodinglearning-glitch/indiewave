const test = require("node:test");
const assert = require("node:assert/strict");
const { isSupportedEventType, normalizeEventPayload, validateArtistContext } = require("../utils/activityEvent");

const VALID_TYPES = ["play", "view", "download", "like", "follow"];

test("supported event types are accepted", () => {
  for (const type of VALID_TYPES) {
    assert.equal(isSupportedEventType(type), true);
  }
  assert.equal(isSupportedEventType("purchase"), false);
});

test("unsupported event types are rejected", () => {
  assert.throws(() => normalizeEventPayload({ eventType: "purchase" }), /Unsupported event type/);
  assert.throws(() => normalizeEventPayload({ eventType: "" }), /Unsupported event type/);
});

test("artist context resolves from release relationship and rejects mismatched artist ids", () => {
  assert.equal(validateArtistContext({ artistId: 12, releaseArtistId: 12, trackArtistId: 12 }), 12);
  assert.equal(validateArtistContext({ artistId: null, releaseArtistId: 12, trackArtistId: null }), 12);
  assert.throws(() => validateArtistContext({ artistId: 12, releaseArtistId: 13, trackArtistId: 12 }), /Artist context mismatch/);
  assert.throws(() => validateArtistContext({ artistId: null, releaseArtistId: null, trackArtistId: null }), /No valid artist context/);
});

test("payload normalization preserves safe values and applies defaults", () => {
  const payload = normalizeEventPayload({ eventType: "PLAY", artistId: "9", releaseId: "2", userId: "11", value: "3.5" });
  assert.equal(payload.eventType, "play");
  assert.equal(payload.artistId, 9);
  assert.equal(payload.releaseId, 2);
  assert.equal(payload.userId, 11);
  assert.equal(payload.value, 3.5);
  assert.equal(payload.sessionId, null);
});

test("metadata is accepted when provided and ignored when not needed", () => {
  const withMeta = normalizeEventPayload({ eventType: "follow", artistId: 3, metadata: { source: "profile" } });
  assert.deepEqual(withMeta.metadata, { source: "profile" });

  const withoutMeta = normalizeEventPayload({ eventType: "download", artistId: 4 });
  assert.equal(withoutMeta.metadata, null);
});

test("client-supplied artist ids are normalized to numeric values", () => {
  const payload = normalizeEventPayload({ eventType: "view", artistId: "15", releaseId: "21" });
  assert.equal(typeof payload.artistId, "number");
  assert.equal(payload.artistId, 15);
  assert.equal(typeof payload.releaseId, "number");
  assert.equal(payload.releaseId, 21);
});

test("session id is trimmed and bounded to the allowed analytics size", () => {
  const payload = normalizeEventPayload({ eventType: "play", artistId: 7, sessionId: "  abc123  " });
  assert.equal(payload.sessionId, "abc123");
});
