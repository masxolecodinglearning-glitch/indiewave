const db = require("../config/db");

async function createUser({
  name,
  email,
  passwordHash,
  stageName,
  country,
  genre,
  bio,
  role = "artist",
  slug
}) {
  const query = `
    INSERT INTO users (name, email, password_hash, stage_name, country, genre, bio, role, slug)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, name, email, stage_name, country, genre, bio, role, slug, created_at
  `;
  const values = [name, email, passwordHash, stageName, country, genre, bio, role, slug];
  const { rows } = await db.query(query, values);
  return rows[0];
}

async function findByEmail(email) {
  const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT id, name, email, stage_name, country, genre, bio, role, slug, profile_image, created_at
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
  const { rows } = await db.query(query, [artistId]);
  return rows[0];
}

module.exports = {
  createUser,
  findByEmail,
  findById,
  findBySlug,
  updateUser,
  getArtistStats
};