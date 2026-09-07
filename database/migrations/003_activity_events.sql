CREATE TABLE IF NOT EXISTS activity_events (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('play', 'view', 'download', 'like', 'follow')),
  artist_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id BIGINT REFERENCES releases(id) ON DELETE CASCADE,
  track_id BIGINT REFERENCES release_tracks(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(200),
  marketplace_product_id BIGINT REFERENCES marketplace_products(id) ON DELETE CASCADE,
  marketplace_event_id BIGINT REFERENCES marketplace_events(id) ON DELETE CASCADE,
  value NUMERIC(12,2) NOT NULL DEFAULT 1,
  metadata JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_events_occurred_at
  ON activity_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_artist_occurred_at
  ON activity_events (artist_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_release_type_occurred_at
  ON activity_events (release_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_track_type_occurred_at
  ON activity_events (track_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_type_occurred_at
  ON activity_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_user_type_occurred_at
  ON activity_events (user_id, event_type, occurred_at DESC);
