const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireFields } = require("../middleware/validators");
const liveController = require("../controllers/liveController");
const { upload } = require("../utils/upload");

const router = express.Router();

router.get("/", liveController.listLivePerformances);
router.post("/", requireAuth, upload.single("replayVideo"), requireFields(["title", "scheduledAt"]), liveController.createLivePerformance);

module.exports = router;