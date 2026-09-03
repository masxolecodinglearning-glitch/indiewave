CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  stage_name VARCHAR(120) NOT NULL,
  country VARCHAR(80) NOT NULL,
  genre VARCHAR(80) NOT NULL,
  bio TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'artist' CHECK (role IN ('artist', 'listener', 'admin')),
  slug VARCHAR(160) UNIQUE NOT NULL,
  profile_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS releases (
  id BIGSERIAL PRIMARY KEY,
  artist_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  type VARCHAR(30) NOT NULL CHECK (type IN ('single', 'ep', 'album', 'mixtape', 'dj_mix', 'video', 'live_performance')),
  genre VARCHAR(80) NOT NULL,
  category VARCHAR(80) NOT NULL,
  country VARCHAR(80) NOT NULL,
  artwork_path TEXT,
  media_audio_path TEXT,
  media_video_path TEXT,
  download_count BIGINT NOT NULL DEFAULT 0,
  listen_count BIGINT NOT NULL DEFAULT 0,
  view_count BIGINT NOT NULL DEFAULT 0,
  video_view_count BIGINT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  replay_available BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  content_type VARCHAR(20) NOT NULL DEFAULT 'upload' CHECK (content_type IN ('upload', 'embed')),
  embed_provider VARCHAR(30) CHECK (embed_provider IN ('youtube', 'spotify', 'ditto', 'distrokid')),
  embed_url TEXT,
  embed_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS release_tracks (
  id BIGSERIAL PRIMARY KEY,
  release_id BIGINT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  track_number INTEGER NOT NULL CHECK (track_number > 0),
  title VARCHAR(200) NOT NULL,
  audio_path TEXT NOT NULL,
  duration INTEGER,
  listen_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (release_id, track_number)
);

ALTER TABLE release_tracks ADD COLUMN IF NOT EXISTS listen_count BIGINT NOT NULL DEFAULT 0;

-- IndieWave Embed: additive columns for pre-existing "releases" tables.
-- CREATE TABLE IF NOT EXISTS above is a no-op when the table already exists,
-- so these ADD COLUMN IF NOT EXISTS statements keep older databases in sync
-- without touching any existing column, data, or the upload-only path.
ALTER TABLE releases ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) NOT NULL DEFAULT 'upload';
ALTER TABLE releases ADD COLUMN IF NOT EXISTS embed_provider VARCHAR(30);
ALTER TABLE releases ADD COLUMN IF NOT EXISTS embed_url TEXT;
ALTER TABLE releases ADD COLUMN IF NOT EXISTS embed_id VARCHAR(255);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'releases_content_type_check'
  ) THEN
    ALTER TABLE releases ADD CONSTRAINT releases_content_type_check
      CHECK (content_type IN ('upload', 'embed'));
  END IF;
END $$;

-- Provider list dropped Apple Music and added Ditto/DistroKid pre-save links.
-- Dropped and recreated NOT VALID so it never fails on rows written before this change.
ALTER TABLE releases DROP CONSTRAINT IF EXISTS releases_embed_provider_check;
ALTER TABLE releases ADD CONSTRAINT releases_embed_provider_check
  CHECK (embed_provider IN ('youtube', 'spotify', 'ditto', 'distrokid')) NOT VALID;

CREATE TABLE IF NOT EXISTS followers (
  id BIGSERIAL PRIMARY KEY,
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, artist_id)
);

CREATE TABLE IF NOT EXISTS likes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id BIGINT REFERENCES releases(id) ON DELETE CASCADE,
  track_id BIGINT REFERENCES release_tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, release_id)
);

ALTER TABLE likes ALTER COLUMN release_id DROP NOT NULL;
ALTER TABLE likes ADD COLUMN IF NOT EXISTS track_id BIGINT REFERENCES release_tracks(id) ON DELETE CASCADE;
ALTER TABLE likes DROP CONSTRAINT IF EXISTS likes_release_or_track_check;
ALTER TABLE likes ADD CONSTRAINT likes_release_or_track_check CHECK ((release_id IS NOT NULL) <> (track_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_user_track ON likes(user_id, track_id) WHERE track_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id BIGINT REFERENCES releases(id) ON DELETE CASCADE,
  track_id BIGINT REFERENCES release_tracks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE comments ALTER COLUMN release_id DROP NOT NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS track_id BIGINT REFERENCES release_tracks(id) ON DELETE CASCADE;
ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_release_or_track_check;
ALTER TABLE comments ADD CONSTRAINT comments_release_or_track_check CHECK ((release_id IS NOT NULL) <> (track_id IS NOT NULL));

CREATE TABLE IF NOT EXISTS track_listens (
  id BIGSERIAL PRIMARY KEY,
  track_id BIGINT NOT NULL REFERENCES release_tracks(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(track_id, session_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  related_id BIGINT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL DEFAULT 'New AI Conversation',
  summary TEXT,
  summary_updated_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  request_id VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated
  ON ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created
  ON ai_messages(conversation_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user_conversation
  ON ai_messages(user_id, conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_messages_user_request
  ON ai_messages(user_id, request_id) WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS live_performances (
  id BIGSERIAL PRIMARY KEY,
  artist_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  replay_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type VARCHAR(30) NOT NULL CHECK (report_type IN ('content', 'copyright')),
  target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('artist', 'release', 'comment', 'track')),
  target_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('artist', 'release', 'comment', 'track')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_users_slug ON users(slug);

-- ============================================================
-- MARKETPLACE TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS marketplace_products (
  id BIGSERIAL PRIMARY KEY,
  seller_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'ZAR',
  category VARCHAR(80) NOT NULL DEFAULT 'other',
  condition VARCHAR(30) NOT NULL DEFAULT 'new' CHECK (condition IN ('new','used','refurbished')),
  stock_quantity INT NOT NULL DEFAULT 1,
  image_path TEXT,
  external_purchase_url TEXT,
  whatsapp_contact TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold_out','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_events (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  venue_name VARCHAR(200),
  location TEXT,
  poster_path TEXT,
  facebook_url TEXT,
  tiktok_url TEXT,
  instagram_url TEXT,
  website_url TEXT,
  whatsapp_url TEXT,
  ticket_url TEXT,
  ticket_provider VARCHAR(80),
  ticket_price NUMERIC(12,2),
  ticket_currency VARCHAR(10) DEFAULT 'ZAR',
  qr_code_path TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','ended','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_comments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('product','event')),
  target_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_reactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('product','event')),
  target_id BIGINT NOT NULL,
  emoji VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_seller ON marketplace_products(seller_id);
CREATE INDEX IF NOT EXISTS idx_mp_status ON marketplace_products(status);
CREATE INDEX IF NOT EXISTS idx_me_owner ON marketplace_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_me_date ON marketplace_events(event_date);
CREATE INDEX IF NOT EXISTS idx_mc_target ON marketplace_comments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_mr_target ON marketplace_reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_releases_artist_id ON releases(artist_id);
CREATE INDEX IF NOT EXISTS idx_releases_type ON releases(type);
CREATE INDEX IF NOT EXISTS idx_releases_genre ON releases(genre);
CREATE INDEX IF NOT EXISTS idx_releases_country ON releases(country);
CREATE INDEX IF NOT EXISTS idx_releases_created_at ON releases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followers_artist_id ON followers(artist_id);
CREATE INDEX IF NOT EXISTS idx_likes_release_id ON likes(release_id);
CREATE INDEX IF NOT EXISTS idx_likes_track_id ON likes(track_id);
CREATE INDEX IF NOT EXISTS idx_comments_release_id ON comments(release_id);
CREATE INDEX IF NOT EXISTS idx_comments_track_id ON comments(track_id);
CREATE INDEX IF NOT EXISTS idx_track_listens_track_id ON track_listens(track_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);