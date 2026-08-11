const db = require("../config/db");

async function dashboardStats() {
  const query = `
    SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE role = 'artist') AS artists,
      (SELECT COUNT(*) FROM releases WHERE is_deleted = false) AS releases,
      (SELECT COUNT(*) FROM comments) AS comments,
      (SELECT COUNT(*) FROM likes) AS likes,
      (SELECT COUNT(*) FROM reports WHERE status = 'open') AS open_reports
  `;
  const { rows } = await db.query(query);
  return rows[0];
}

async function listReports() {
  const query = `
    SELECT r.*, u.stage_name AS reporter_name
    FROM reports r
    JOIN users u ON u.id = r.reporter_id
    ORDER BY r.created_at DESC
  `;
  const { rows } = await db.query(query);
  return rows;
}

async function createReport({ reporterId, reportType, targetType, targetId, reason, details }) {
  const query = `
    INSERT INTO reports (reporter_id, report_type, target_type, target_id, reason, details)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [reporterId, reportType, targetType, targetId, reason, details || null];
  const { rows } = await db.query(query, values);
  return rows[0];
}

async function updateReportStatus(reportId, status) {
  const query = "UPDATE reports SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *";
  const { rows } = await db.query(query, [status, reportId]);
  return rows[0] || null;
}

module.exports = {
  dashboardStats,
  listReports,
  createReport,
  updateReportStatus
};