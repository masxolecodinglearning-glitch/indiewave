const db = require("../config/db");

// ── Products ────────────────────────────────────────────────────────────────

async function listProducts({ category, sellerId, limit = 50, offset = 0 } = {}) {
  const conditions = ["p.status != 'inactive'"];
  const params = [];
  if (category) { params.push(category); conditions.push(`p.category = $${params.length}`); }
  if (sellerId) { params.push(sellerId); conditions.push(`p.seller_id = $${params.length}`); }
  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT p.*, u.stage_name AS seller_name, u.slug AS seller_slug,
            COALESCE(rc.cnt,0) AS comment_count, COALESCE(rr.cnt,0) AS reaction_count
     FROM marketplace_products p
     JOIN users u ON u.id = p.seller_id
     LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM marketplace_comments WHERE target_type='product' GROUP BY target_id) rc ON rc.target_id = p.id
     LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM marketplace_reactions WHERE target_type='product' GROUP BY target_id) rr ON rr.target_id = p.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getProductById(id) {
  const { rows } = await db.query(
    `SELECT p.*, u.stage_name AS seller_name, u.slug AS seller_slug, u.profile_image AS seller_image,
            COALESCE(rc.cnt,0) AS comment_count, COALESCE(rr.cnt,0) AS reaction_count
     FROM marketplace_products p
     JOIN users u ON u.id = p.seller_id
     LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM marketplace_comments WHERE target_type='product' GROUP BY target_id) rc ON rc.target_id = p.id
     LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM marketplace_reactions WHERE target_type='product' GROUP BY target_id) rr ON rr.target_id = p.id
     WHERE p.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createProduct({ sellerId, title, description, price, currency, category, condition, stockQuantity, imagePath, externalPurchaseUrl, whatsappContact }) {
  const { rows } = await db.query(
    `INSERT INTO marketplace_products (seller_id, title, description, price, currency, category, condition, stock_quantity, image_path, external_purchase_url, whatsapp_contact)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [sellerId, title, description || null, price, currency || "ZAR", category || "other",
     condition || "new", stockQuantity || 1, imagePath || null, externalPurchaseUrl || null, whatsappContact || null]
  );
  return rows[0];
}

async function updateProduct(id, sellerId, fields) {
  const allowed = ["title","description","price","currency","category","condition","stock_quantity","image_path","external_purchase_url","whatsapp_contact","status"];
  const sets = [];
  const params = [id, sellerId];
  Object.entries(fields).forEach(([k, v]) => {
    if (allowed.includes(k)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  });
  if (!sets.length) return null;
  sets.push("updated_at = NOW()");
  const { rows } = await db.query(
    `UPDATE marketplace_products SET ${sets.join(",")} WHERE id=$1 AND seller_id=$2 RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function deleteProduct(id, sellerId) {
  const { rowCount } = await db.query(
    "DELETE FROM marketplace_products WHERE id=$1 AND seller_id=$2",
    [id, sellerId]
  );
  return rowCount > 0;
}

// ── Events ──────────────────────────────────────────────────────────────────

async function listEvents({ status, ownerId, limit = 50, offset = 0 } = {}) {
  const conditions = ["1=1"];
  const params = [];
  if (status) { params.push(status); conditions.push(`e.status = $${params.length}`); }
  if (ownerId) { params.push(ownerId); conditions.push(`e.owner_id = $${params.length}`); }
  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT e.*, u.stage_name AS owner_name, u.slug AS owner_slug,
            COALESCE(rc.cnt,0) AS comment_count, COALESCE(rr.cnt,0) AS reaction_count
     FROM marketplace_events e
     JOIN users u ON u.id = e.owner_id
     LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM marketplace_comments WHERE target_type='event' GROUP BY target_id) rc ON rc.target_id = e.id
     LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM marketplace_reactions WHERE target_type='event' GROUP BY target_id) rr ON rr.target_id = e.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY e.event_date ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getEventById(id) {
  const { rows } = await db.query(
    `SELECT e.*, u.stage_name AS owner_name, u.slug AS owner_slug, u.profile_image AS owner_image,
            COALESCE(rc.cnt,0) AS comment_count, COALESCE(rr.cnt,0) AS reaction_count
     FROM marketplace_events e
     JOIN users u ON u.id = e.owner_id
     LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM marketplace_comments WHERE target_type='event' GROUP BY target_id) rc ON rc.target_id = e.id
     LEFT JOIN (SELECT target_id, COUNT(*) AS cnt FROM marketplace_reactions WHERE target_type='event' GROUP BY target_id) rr ON rr.target_id = e.id
     WHERE e.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createEvent({ ownerId, title, description, eventDate, startTime, endTime, venueName, location, posterPath, facebookUrl, tiktokUrl, instagramUrl, websiteUrl, whatsappUrl, ticketUrl, ticketProvider, ticketPrice, ticketCurrency, qrCodePath, status }) {
  const { rows } = await db.query(
    `INSERT INTO marketplace_events (owner_id, title, description, event_date, start_time, end_time, venue_name, location, poster_path, facebook_url, tiktok_url, instagram_url, website_url, whatsapp_url, ticket_url, ticket_provider, ticket_price, ticket_currency, qr_code_path, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [ownerId, title, description || null, eventDate, startTime || null, endTime || null,
     venueName || null, location || null, posterPath || null, facebookUrl || null,
     tiktokUrl || null, instagramUrl || null, websiteUrl || null, whatsappUrl || null,
     ticketUrl || null, ticketProvider || null, ticketPrice || null, ticketCurrency || "ZAR",
     qrCodePath || null, status || "upcoming"]
  );
  return rows[0];
}

async function updateEvent(id, ownerId, fields) {
  const allowed = ["title","description","event_date","start_time","end_time","venue_name","location","poster_path","facebook_url","tiktok_url","instagram_url","website_url","whatsapp_url","ticket_url","ticket_provider","ticket_price","ticket_currency","qr_code_path","status"];
  const sets = [];
  const params = [id, ownerId];
  Object.entries(fields).forEach(([k, v]) => {
    if (allowed.includes(k)) { params.push(v); sets.push(`${k} = $${params.length}`); }
  });
  if (!sets.length) return null;
  sets.push("updated_at = NOW()");
  const { rows } = await db.query(
    `UPDATE marketplace_events SET ${sets.join(",")} WHERE id=$1 AND owner_id=$2 RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function deleteEvent(id, ownerId) {
  const { rowCount } = await db.query(
    "DELETE FROM marketplace_events WHERE id=$1 AND owner_id=$2",
    [id, ownerId]
  );
  return rowCount > 0;
}

// ── Comments ─────────────────────────────────────────────────────────────────

async function listComments(targetType, targetId) {
  const { rows } = await db.query(
    `SELECT c.*, u.stage_name, u.profile_image
     FROM marketplace_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.target_type=$1 AND c.target_id=$2
     ORDER BY c.created_at ASC`,
    [targetType, targetId]
  );
  return rows;
}

async function addComment(userId, targetType, targetId, content) {
  const { rows } = await db.query(
    `INSERT INTO marketplace_comments (user_id, target_type, target_id, content)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, targetType, targetId, content]
  );
  return rows[0];
}

// ── Reactions ────────────────────────────────────────────────────────────────

async function getReactions(targetType, targetId) {
  const { rows } = await db.query(
    `SELECT emoji, COUNT(*) AS count FROM marketplace_reactions
     WHERE target_type=$1 AND target_id=$2 GROUP BY emoji`,
    [targetType, targetId]
  );
  return rows;
}

async function toggleReaction(userId, targetType, targetId, emoji) {
  const existing = await db.query(
    "SELECT id, emoji FROM marketplace_reactions WHERE user_id=$1 AND target_type=$2 AND target_id=$3",
    [userId, targetType, targetId]
  );

  if (existing.rows.length > 0) {
    const prev = existing.rows[0];
    if (prev.emoji === emoji) {
      // Same emoji — remove
      await db.query("DELETE FROM marketplace_reactions WHERE id=$1", [prev.id]);
      return { action: "removed", emoji };
    }
    // Different emoji — update
    await db.query("UPDATE marketplace_reactions SET emoji=$1, created_at=NOW() WHERE id=$2", [emoji, prev.id]);
    return { action: "changed", emoji };
  }

  await db.query(
    "INSERT INTO marketplace_reactions (user_id, target_type, target_id, emoji) VALUES ($1,$2,$3,$4)",
    [userId, targetType, targetId, emoji]
  );
  return { action: "added", emoji };
}

module.exports = {
  listProducts, getProductById, createProduct, updateProduct, deleteProduct,
  listEvents, getEventById, createEvent, updateEvent, deleteEvent,
  listComments, addComment, getReactions, toggleReaction
};
