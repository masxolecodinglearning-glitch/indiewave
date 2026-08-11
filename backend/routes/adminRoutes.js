const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { requireFields } = require("../middleware/validators");
const adminController = require("../controllers/adminController");

const router = express.Router();

router.get("/dashboard", requireAuth, requireAdmin, adminController.dashboard);
router.post("/reports", requireAuth, requireFields(["reportType", "targetType", "targetId", "reason"]), adminController.createReport);
router.patch("/reports/:reportId", requireAuth, requireAdmin, requireFields(["status"]), adminController.updateReport);

module.exports = router;