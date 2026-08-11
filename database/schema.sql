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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  release_id BIGINT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, release_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id BIGINT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  target_type VARCHAR(30) NOT NULL CHECK (target_type IN ('artist', 'release', 'comment')),
  target_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_slug ON users(slug);
CREATE INDEX IF NOT EXISTS idx_releases_artist_id ON releases(artist_id);
CREATE INDEX IF NOT EXISTS idx_releases_type ON releases(type);
CREATE INDEX IF NOT EXISTS idx_releases_genre ON releases(genre);
CREATE INDEX IF NOT EXISTS idx_releases_country ON releases(country);
CREATE INDEX IF NOT EXISTS idx_releases_created_at ON releases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followers_artist_id ON followers(artist_id);
CREATE INDEX IF NOT EXISTS idx_likes_release_id ON likes(release_id);
CREATE INDEX IF NOT EXISTS idx_comments_release_id ON comments(release_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);