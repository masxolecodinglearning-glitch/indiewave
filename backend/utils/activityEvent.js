function isSupportedEventType(eventType) {
  return ["play", "view", "download", "like", "follow"].includes(eventType);
}

function normalizeEventPayload(input = {}) {
  const eventType = String(input.eventType || input.type || "").trim().toLowerCase();
  if (!isSupportedEventType(eventType)) {
    throw new Error(`Unsupported event type: ${eventType || "empty"}`);
  }

  return {
    eventType,
    artistId: input.artistId !== undefined && input.artistId !== null ? Number(input.artistId) : null,
    releaseId: input.releaseId !== undefined && input.releaseId !== null ? Number(input.releaseId) : null,
    trackId: input.trackId !== undefined && input.trackId !== null ? Number(input.trackId) : null,
    userId: input.userId !== undefined && input.userId !== null ? Number(input.userId) : null,
    sessionId: input.sessionId !== undefined && input.sessionId !== null ? String(input.sessionId).trim() : null,
    marketplaceProductId: input.marketplaceProductId !== undefined && input.marketplaceProductId !== null ? Number(input.marketplaceProductId) : null,
    marketplaceEventId: input.marketplaceEventId !== undefined && input.marketplaceEventId !== null ? Number(input.marketplaceEventId) : null,
    value: input.value !== undefined && input.value !== null ? Number(input.value) : 1,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : null,
    occurredAt: input.occurredAt || new Date()
  };
}

function validateArtistContext({ artistId = null, releaseArtistId = null, trackArtistId = null } = {}) {
  const validArtistIds = [
    Number.isFinite(Number(artistId)) ? Number(artistId) : null,
    Number.isFinite(Number(releaseArtistId)) ? Number(releaseArtistId) : null,
    Number.isFinite(Number(trackArtistId)) ? Number(trackArtistId) : null
  ].filter((value) => value !== null && value > 0);

  if (validArtistIds.length === 0) {
    throw new Error("No valid artist context available for activity event");
  }

  const canonicalArtistId = validArtistIds[0];
  const allMatch = validArtistIds.every((value) => value === canonicalArtistId);
  if (!allMatch) {
    throw new Error("Artist context mismatch for activity event");
  }

  return canonicalArtistId;
}

module.exports = {
  isSupportedEventType,
  normalizeEventPayload,
  validateArtistContext
};
