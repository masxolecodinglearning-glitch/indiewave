const db = require("../config/db");

async function createRelease({
  artistId,
  title,
  description,
  type,
  genre,
  category,
  country,
  artworkPath,
  mediaAudioPath,
  mediaVideoPath,
  scheduledAt,
  replayAvailable,
  contentType = "upload",
  embedProvider = null,
  embedUrl = null,
  embedId = null
}) {
  const query = `
    INSERT INTO releases (
      artist_id, title, description, type, genre, category, country,
      artwork_path, media_audio_path, media_video_path, scheduled_at, replay_available,
      content_type, embed_provider, embed_url, embed_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *
  `;

  const values = [
    artistId,
    title,
    description,
    type,
    genre,
    category,
    country,
    artworkPath,
    mediaAudioPath,
    mediaVideoPath,
    scheduledAt,
    replayAvailable,
    contentType,
    embedProvider,
    embedUrl,
    embedId
  ];

  const { rows } = await db.query(query, values);
  return rows[0];
}

async function updateRelease(releaseId, artistId, payload) {
  const fields = Object.keys(payload);
  if (fields.length === 0) return getReleaseById(releaseId);

  const setters = fields.map((field, index) => `${field} = $${index + 1}`);
  const values = fields.map((field) => payload[field]);
  values.push(releaseId, artistId);

  const query = `
    UPDATE releases SET ${setters.join(", ")}, updated_at = NOW()
    WHERE id = $${values.length - 1} AND artist_id = $${values.length}
    RETURNING *
  `;
  const { rows } = await db.query(query, values);
  return rows[0] || null;
}

async function softDeleteRelease(releaseId, artistId) {
  const query = `
    UPDATE releases
    SET is_deleted = true, updated_at = NOW()
    WHERE id = $1 AND artist_id = $2
    RETURNING id
  `;
  const { rows } = await db.query(query, [releaseId, artistId]);
  return rows[0] || null;
}

async function getReleaseById(releaseId) {
  const query = `
    SELECT r.*, u.stage_name, u.slug AS artist_slug, u.profile_image
    FROM releases r
    JOIN users u ON u.id = r.artist_id
    WHERE r.id = $1 AND r.is_deleted = false
  `;
  const { rows } = await db.query(query, [releaseId]);
  return rows[0] || null;
}

async function listReleases({
  sort = "recent",
  type,
  genre,
  country,
  category,
  q,
  limit = 20,
  offset = 0
}) {
  let orderBy = "r.created_at DESC";
  if (sort === "trending") orderBy = "(r.download_count + r.view_count + r.listen_count + r.video_view_count) DESC, r.created_at DESC";
  if (sort === "most_downloaded") orderBy = "r.download_count DESC, r.created_at DESC";
  if (sort === "most_viewed") orderBy = "(r.view_count + r.video_view_count) DESC, r.created_at DESC";

  const values = [];
  const where = ["r.is_deleted = false"];

  if (type) {
    values.push(type);
    where.push(`r.type = $${values.length}`);
  }
  if (genre) {
    values.push(genre);
    where.push(`r.genre = $${values.length}`);
  }
  if (country) {
    values.push(country);
    where.push(`r.country = $${values.length}`);
  }
  if (category) {
    values.push(category);
    where.push(`r.category = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    where.push(`(
      r.title ILIKE $${values.length}
      OR r.description ILIKE $${values.length}
      OR r.genre ILIKE $${values.length}
      OR r.category ILIKE $${values.length}
      OR r.country ILIKE $${values.length}
      OR r.embed_provider ILIKE $${values.length}
      OR r.embed_url ILIKE $${values.length}
      OR u.stage_name ILIKE $${values.length}
    )`);
  }

  values.push(limit, offset);
  const query = `
    SELECT r.*, u.stage_name, u.slug AS artist_slug, u.profile_image,
      (SELECT COUNT(*) FROM likes l WHERE l.release_id = r.id) AS likes,
      (SELECT COUNT(*) FROM comments c WHERE c.release_id = r.id) AS comments
    FROM releases r
    JOIN users u ON u.id = r.artist_id
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderBy}
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const { rows } = await db.query(query, values);
  return rows;
}

async function listArtistReleases(artistId) {
  const { rows } = await db.query(
    `SELECT * FROM releases WHERE artist_id = $1 AND is_deleted = false ORDER BY created_at DESC`,
    [artistId]
  );
  return rows;
}

async function incrementCounter(releaseId, column) {
  const allowed = ["download_count", "view_count", "listen_count", "video_view_count"];
  if (!allowed.includes(column)) {
    throw new Error("Invalid metric column");
  }

  const query = `
    UPDATE releases
    SET ${column} = ${column} + 1, updated_at = NOW()
    WHERE id = $1
    RETURNING id
  `;
  const { rows } = await db.query(query, [releaseId]);
  return rows[0] || null;
}

module.exports = {
  createRelease,
  updateRelease,
  softDeleteRelease,
  getReleaseById,
  listReleases,
  listArtistReleases,
  incrementCounter
};