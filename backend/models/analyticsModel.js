const db = require("../config/db");

async function getArtistAnalytics(artistId) {
  const { rows } = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE event_type = 'play' AND occurred_at >= NOW() - INTERVAL '7 days') AS plays_7d,
      COUNT(*) FILTER (WHERE event_type = 'view' AND occurred_at >= NOW() - INTERVAL '7 days') AS views_7d,
      COUNT(*) FILTER (WHERE event_type = 'download' AND occurred_at >= NOW() - INTERVAL '7 days') AS downloads_7d,
      COUNT(*) FILTER (WHERE event_type = 'like' AND occurred_at >= NOW() - INTERVAL '7 days') AS likes_7d,
      COUNT(DISTINCT COALESCE(user_id::text, 'session:' || session_id)) FILTER (WHERE event_type = 'play' AND occurred_at >= NOW() - INTERVAL '7 days' AND (user_id IS NOT NULL OR session_id IS NOT NULL)) AS distinct_listeners_7d,
      COUNT(*) FILTER (WHERE event_type = 'follow' AND occurred_at >= NOW() - INTERVAL '30 days') AS follower_growth_30d,
      COUNT(*) FILTER (WHERE event_type = 'play' AND occurred_at >= NOW() - INTERVAL '14 days' AND occurred_at < NOW() - INTERVAL '7 days') AS plays_previous_7d,
      COUNT(*) FILTER (WHERE event_type = 'follow' AND occurred_at >= NOW() - INTERVAL '60 days' AND occurred_at < NOW() - INTERVAL '30 days') AS follower_growth_previous_30d,
      COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '30 days') AS engagement_30d
     FROM activity_events WHERE artist_id = $1`,
    [artistId]
  );
  return rows[0] || {};
}

async function getReleaseAnalytics(releaseId) {
  const { rows } = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE event_type = 'play' AND occurred_at >= NOW() - INTERVAL '7 days') AS plays_7d,
      COUNT(*) FILTER (WHERE event_type = 'view' AND occurred_at >= NOW() - INTERVAL '7 days') AS views_7d,
      COUNT(*) FILTER (WHERE event_type = 'download' AND occurred_at >= NOW() - INTERVAL '7 days') AS downloads_7d,
      COUNT(*) FILTER (WHERE event_type = 'like' AND occurred_at >= NOW() - INTERVAL '7 days') AS likes_7d,
      COUNT(*) FILTER (WHERE event_type = 'play' AND occurred_at >= NOW() - INTERVAL '14 days' AND occurred_at < NOW() - INTERVAL '7 days') AS plays_previous_7d,
      COUNT(*) FILTER (WHERE event_type = 'view' AND occurred_at >= NOW() - INTERVAL '14 days' AND occurred_at < NOW() - INTERVAL '7 days') AS views_previous_7d,
      COUNT(*) FILTER (WHERE event_type = 'download' AND occurred_at >= NOW() - INTERVAL '14 days' AND occurred_at < NOW() - INTERVAL '7 days') AS downloads_previous_7d,
      COUNT(*) FILTER (WHERE event_type = 'like' AND occurred_at >= NOW() - INTERVAL '14 days' AND occurred_at < NOW() - INTERVAL '7 days') AS likes_previous_7d
     FROM activity_events WHERE release_id = $1`,
    [releaseId]
  );
  return rows[0] || {};
}

module.exports = { getArtistAnalytics, getReleaseAnalytics };