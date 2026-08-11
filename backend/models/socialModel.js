const db = require("../config/db");

async function toggleFollow(followerId, artistId) {
  if (followerId === artistId) {
    return { followed: false, reason: "Cannot follow yourself" };
  }

  const existing = await db.query(
    "SELECT id FROM followers WHERE follower_id = $1 AND artist_id = $2",
    [followerId, artistId]
  );

  if (existing.rows.length > 0) {
    await db.query("DELETE FROM followers WHERE follower_id = $1 AND artist_id = $2", [
      followerId,
      artistId
    ]);
    return { followed: false };
  }

  await db.query("INSERT INTO followers (follower_id, artist_id) VALUES ($1, $2)", [
    followerId,
    artistId
  ]);
  return { followed: true };
}

async function toggleLike(userId, releaseId) {
  const existing = await db.query("SELECT id FROM likes WHERE user_id = $1 AND release_id = $2", [
    userId,
    releaseId
  ]);

  if (existing.rows.length > 0) {
    await db.query("DELETE FROM likes WHERE user_id = $1 AND release_id = $2", [userId, releaseId]);
    return { liked: false };
  }

  await db.query("INSERT INTO likes (user_id, release_id) VALUES ($1, $2)", [userId, releaseId]);
  return { liked: true };
}

async function addComment(userId, releaseId, content) {
  const query = `
    INSERT INTO comments (user_id, release_id, content)
    VALUES ($1, $2, $3)
    RETURNING id, user_id, release_id, content, created_at
  `;
  const { rows } = await db.query(query, [userId, releaseId, content]);
  return rows[0];
}

async function getComments(releaseId) {
  const query = `
    SELECT c.id, c.release_id, c.content, c.created_at, u.id AS user_id, u.stage_name, u.slug, u.profile_image
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.release_id = $1
    ORDER BY c.created_at DESC
  `;
  const { rows } = await db.query(query, [releaseId]);
  return rows;
}

module.exports = {
  toggleFollow,
  toggleLike,
  addComment,
  getComments
};