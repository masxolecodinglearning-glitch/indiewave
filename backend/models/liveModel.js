const db = require("../config/db");

async function createPerformance({ artistId, title, description, scheduledAt, replayPath }) {
  const query = `
    INSERT INTO live_performances (artist_id, title, description, scheduled_at, replay_path)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const { rows } = await db.query(query, [artistId, title, description, scheduledAt, replayPath]);
  return rows[0];
}

async function listUpcoming() {
  const query = `
    SELECT lp.*, u.stage_name, u.slug AS artist_slug
    FROM live_performances lp
    JOIN users u ON u.id = lp.artist_id
    WHERE lp.scheduled_at >= NOW() OR lp.replay_path IS NOT NULL
    ORDER BY lp.scheduled_at ASC
  `;
  const { rows } = await db.query(query);
  return rows;
}

module.exports = {
  createPerformance,
  listUpcoming
};