const db = require("../config/db");

async function createBeat({ sellerId, title, description, genre, audioPath, artworkPath, price, currency }) {
  const { rows } = await db.query(
    `INSERT INTO beats (seller_id, title, description, genre, audio_path, artwork_path, price, currency, rights_confirmed, rights_confirmed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW()) RETURNING *`,
    [sellerId, title, description || null, genre, audioPath, artworkPath, price, currency || "ZAR"]
  );
  return rows[0];
}

async function listBeats({ limit = 50, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT b.*, u.stage_name AS seller_name, u.slug AS seller_slug
     FROM beats b JOIN users u ON u.id = b.seller_id
     ORDER BY b.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

module.exports = { createBeat, listBeats };
