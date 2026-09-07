const db = require("../config/db");
const analyticsModel = require("./analyticsModel");
const { artistMomentum, artistMomentumSql, artistState, growth } = require("../utils/analytics");

async function createUser({
  name,
  email,
  passwordHash,
  stageName,
  country,
  genre,
  bio,
  role = "artist",
  slug,
  termsVersion,
  termsAcceptedAt
}) {
  const query = `
    INSERT INTO users (name, email, password_hash, stage_name, country, genre, bio, role, slug, terms_version, terms_accepted_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, name, email, stage_name, country, genre, bio, role, slug, terms_version, terms_accepted_at, created_at
  `;
  const values = [name, email, passwordHash, stageName, country, genre, bio, role, slug, termsVersion, termsAcceptedAt];
  const { rows } = await db.query(query, values);
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, name, email, stage_name, country, genre, bio, role, slug, profile_image, terms_version, terms_accepted_at, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findBySlug(slug) {
  const { rows } = await db.query(
    `SELECT id, name, stage_name, country, genre, bio, slug, profile_image, created_at
     FROM users WHERE slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

async function updateUser(id, payload) {
  const fields = Object.keys(payload);
  if (fields.length === 0) return findById(id);

  const setters = fields.map((field, index) => `${field} = $${index + 1}`);
  const values = fields.map((field) => payload[field]);
  values.push(id);

  const query = `
    UPDATE users SET ${setters.join(", ")}, updated_at = NOW()
    WHERE id = $${values.length}
    RETURNING id, name, email, stage_name, country, genre, bio, role, slug, profile_image, created_at, updated_at
  `;

  const { rows } = await db.query(query, values);
  return rows[0] || null;
}

async function getArtistStats(artistId) {
  const query = `
    SELECT
      (SELECT COUNT(*) FROM followers WHERE artist_id = $1) AS followers,
      (SELECT COUNT(*) FROM releases WHERE artist_id = $1 AND is_deleted = false) AS releases,
      (SELECT COALESCE(SUM(download_count), 0) FROM releases WHERE artist_id = $1) AS downloads,
      (SELECT COALESCE(SUM(view_count), 0) FROM releases WHERE artist_id = $1) AS views,
      (SELECT COALESCE(SUM(listen_count), 0) FROM releases WHERE artist_id = $1) AS listens
  `;
  const [{ rows }, historical] = await Promise.all([
    db.query(query, [artistId]),
    analyticsModel.getArtistAnalytics(artistId)
  ]);
  const stats = rows[0] || {};
  const plays7d = Number(historical.plays_7d || 0);
  const distinctListeners7d = Number(historical.distinct_listeners_7d || 0);
  const followerGrowth30d = Number(historical.follower_growth_30d || 0);
  const likes7d = Number(historical.likes_7d || 0);
  const downloads7d = Number(historical.downloads_7d || 0);

  return {
    ...stats,
    plays_7d: plays7d,
    distinct_listeners_7d: distinctListeners7d,
    likes_7d: likes7d,
    downloads_7d: downloads7d,
    follower_growth_30d: followerGrowth30d,
    previous_plays_7d: Number(historical.plays_previous_7d || 0),
    previous_follower_growth_30d: Number(historical.follower_growth_previous_30d || 0),
    follower_growth_comparison: growth(followerGrowth30d, historical.follower_growth_previous_30d),
    momentum: artistMomentum({
      plays: plays7d,
      distinctListeners: distinctListeners7d,
      followerGrowth: followerGrowth30d,
      likes: likes7d,
      downloads: downloads7d,
      recencyBonus: Number(historical.engagement_30d || 0) > 0 ? 1 : 0
    }),
    state: artistState({
      artistExists: true,
      hasUsableProfile: true,
      publishedReleaseCount: stats.releases,
      recentEngagement: Number(historical.engagement_30d || 0) > 0
    })
  };
}

async function acceptTerms(id, termsVersion) {
  const { rows } = await db.query(
    `UPDATE users SET terms_version = $2, terms_accepted_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, stage_name, country, genre, bio, role, slug, profile_image, terms_version, terms_accepted_at, created_at`,
    [id, termsVersion]
  );
  return rows[0] || null;
}

async function listRisingArtists({ genre, country, limit = 20, offset = 0, viewerId = null } = {}) {
  const values = [];
  const where = ["u.role = 'artist'"];
  if (genre) {
    values.push(genre);
    where.push(`u.genre = $${values.length}`);
  }
  if (country) {
    values.push(country);
    where.push(`u.country = $${values.length}`);
  }
  const viewerSelect = viewerId
    ? `, EXISTS (SELECT 1 FROM followers f WHERE f.follower_id = $${values.length + 1} AND f.artist_id = u.id) AS is_following`
    : "";
  if (viewerId) values.push(viewerId);
  values.push(limit, offset);
  const momentumScore = artistMomentumSql({
    plays: "activity.plays_7d",
    listeners: "activity.distinct_listeners_7d",
    followerGrowth: "activity.follower_growth_30d",
    likes: "activity.likes_7d",
    downloads: "activity.downloads_7d",
    recencyBonus: "activity.engagement_30d"
  });
  const query = `
    SELECT u.id AS artist_id, u.name, u.stage_name, u.country, u.genre, u.slug AS artist_slug, u.profile_image,
      releases.published_release_count,
      COALESCE(activity.plays_7d, 0) AS plays_7d,
      COALESCE(activity.distinct_listeners_7d, 0) AS distinct_listeners_7d,
      COALESCE(activity.follower_growth_30d, 0) AS follower_growth_30d,
      COALESCE(activity.likes_7d, 0) AS likes_7d,
      COALESCE(activity.downloads_7d, 0) AS downloads_7d,
      ${momentumScore} AS momentum_score${viewerSelect}
    FROM users u
    JOIN (
      SELECT artist_id, COUNT(*) AS published_release_count, MAX(created_at) AS latest_release_at
      FROM releases
      WHERE is_deleted = false
      GROUP BY artist_id
    ) releases ON releases.artist_id = u.id
    LEFT JOIN (
      SELECT artist_id,
        COUNT(*) FILTER (WHERE event_type = 'play' AND occurred_at >= NOW() - INTERVAL '7 days') AS plays_7d,
        COUNT(DISTINCT COALESCE(user_id::text, 'session:' || session_id)) FILTER (WHERE event_type = 'play' AND occurred_at >= NOW() - INTERVAL '7 days' AND (user_id IS NOT NULL OR session_id IS NOT NULL)) AS distinct_listeners_7d,
        COUNT(*) FILTER (WHERE event_type = 'follow' AND occurred_at >= NOW() - INTERVAL '30 days') AS follower_growth_30d,
        COUNT(*) FILTER (WHERE event_type = 'like' AND occurred_at >= NOW() - INTERVAL '7 days') AS likes_7d,
        COUNT(*) FILTER (WHERE event_type = 'download' AND occurred_at >= NOW() - INTERVAL '7 days') AS downloads_7d,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '30 days') AS engagement_30d
      FROM activity_events
      GROUP BY artist_id
    ) activity ON activity.artist_id = u.id
    WHERE ${where.join(" AND ")}
      AND NULLIF(TRIM(u.stage_name), '') IS NOT NULL
      AND NULLIF(TRIM(u.country), '') IS NOT NULL
      AND NULLIF(TRIM(u.genre), '') IS NOT NULL
    ORDER BY momentum_score DESC, releases.latest_release_at DESC, u.id ASC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;
  const { rows } = await db.query(query, values);
  return rows;
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  findBySlug,
  updateUser,
  getArtistStats,
  listRisingArtists,
  acceptTerms
};