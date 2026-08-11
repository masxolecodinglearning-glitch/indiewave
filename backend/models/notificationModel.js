const db = require("../config/db");

async function createNotification({ userId, type, message, relatedId }) {
  const query = `
    INSERT INTO notifications (user_id, type, message, related_id)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const { rows } = await db.query(query, [userId, type, message, relatedId || null]);
  return rows[0];
}

async function listNotifications(userId) {
  const { rows } = await db.query(
    "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [userId]
  );
  return rows;
}

async function markRead(userId, notificationId) {
  const { rows } = await db.query(
    "UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *",
    [notificationId, userId]
  );
  return rows[0] || null;
}

module.exports = {
  createNotification,
  listNotifications,
  markRead
};