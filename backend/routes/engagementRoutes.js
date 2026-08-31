const express = require("express");
const engagementController = require("../controllers/engagementController");

const router = express.Router();

router.post("/releases/:releaseId/download", engagementController.trackDownload);
router.get("/releases/:releaseId/download", engagementController.downloadRelease);
router.post("/releases/:releaseId/listen", engagementController.trackListen);
router.post("/releases/:releaseId/view", engagementController.trackView);

module.exports = router;