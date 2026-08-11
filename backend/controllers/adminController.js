const ApiError = require("../utils/apiError");
const adminModel = require("../models/adminModel");

async function dashboard(req, res, next) {
  try {
    const stats = await adminModel.dashboardStats();
    const reports = await adminModel.listReports();
    res.json({ success: true, stats, reports });
  } catch (error) {
    next(error);
  }
}

async function createReport(req, res, next) {
  try {
    const report = await adminModel.createReport({
      reporterId: req.user.id,
      reportType: req.body.reportType,
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      reason: req.body.reason,
      details: req.body.details
    });
    res.status(201).json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

async function updateReport(req, res, next) {
  try {
    const report = await adminModel.updateReportStatus(Number(req.params.reportId), req.body.status);
    if (!report) throw new ApiError(404, "Report not found");
    res.json({ success: true, report });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  dashboard,
  createReport,
  updateReport
};