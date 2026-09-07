const db = require("../config/db");
const releaseModel = require("./releaseModel");
const {
  isSupportedEventType,
  normalizeEventPayload,
  validateArtistContext
} = require("../utils/activityEvent");

async function resolveArtistId({ releaseId = null, trackId = null, fallbackArtistId = null } = {}) {
  if (trackId) {
    const track = await releaseModel.getTrackById(Number(trackId));
    if (!track) return null;
    return Number(track.artist_id);
  }

  if (releaseId) {
    const release = await releaseModel.getReleaseById(Number(releaseId));
    if (!release) return null;
    return Number(release.artist_id);
  }

  if (fallbackArtistId !== null && fallbackArtistId !== undefined) {
    const fallback = Number(fallbackArtistId);
    if (Number.isFinite(fallback) && fallback > 0) return fallback;
  }

  return null;
}

async function recordEvent(input = {}) {
  const payload = normalizeEventPayload(input);

  let resolvedArtistId = payload.artistId;
  let releaseArtistId = null;
  let trackArtistId = null;

  if (payload.releaseId) {
    const release = await releaseModel.getReleaseById(Number(payload.releaseId));
    if (!release) throw new Error("Release not found for activity event");
    releaseArtistId = Number(release.artist_id);
    resolvedArtistId = releaseArtistId;
  }

  if (payload.trackId) {
    const track = await releaseModel.getTrackById(Number(payload.trackId), payload.releaseId ? Number(payload.releaseId) : null);
    if (!track) throw new Error("Track not found for activity event");
    trackArtistId = Number(track.artist_id);
    resolvedArtistId = trackArtistId;
  }

  const finalArtistId = validateArtistContext({
    artistId: resolvedArtistId,
    releaseArtistId,
    trackArtistId
  });

  const query = `
    INSERT INTO activity_events (
      event_type,
      artist_id,
      release_id,
      track_id,
      user_id,
      session_id,
      marketplace_product_id,
      marketplace_event_id,
      value,
      metadata,
      occurred_at,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    RETURNING *
  `;

  const { rows } = await db.query(query, [
    payload.eventType,
    Number(finalArtistId),
    payload.releaseId ? Number(payload.releaseId) : null,
    payload.trackId ? Number(payload.trackId) : null,
    payload.userId ? Number(payload.userId) : null,
    payload.sessionId ? String(payload.sessionId).slice(0, 200) : null,
    payload.marketplaceProductId ? Number(payload.marketplaceProductId) : null,
    payload.marketplaceEventId ? Number(payload.marketplaceEventId) : null,
    Number(payload.value),
    payload.metadata && Object.keys(payload.metadata).length ? payload.metadata : null,
    payload.occurredAt instanceof Date ? payload.occurredAt : new Date(payload.occurredAt)
  ]);

  return rows[0] || null;
}

module.exports = {
  VALID_EVENT_TYPES: Array.from(new Set(["play", "view", "download", "like", "follow"])),
  isSupportedEventType,
  resolveArtistId,
  recordEvent
};
