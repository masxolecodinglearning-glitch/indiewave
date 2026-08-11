const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireFields } = require("../middleware/validators");
const releaseController = require("../controllers/releaseController");
const { upload } = require("../utils/upload");

const router = express.Router();

const releaseUpload = upload.fields([
  { name: "audio", maxCount: 5 },
  { name: "video", maxCount: 5 },
  { name: "artwork", maxCount: 1 }
]);

router.get("/", releaseController.listReleases);
router.get("/dashboard/mine", requireAuth, releaseController.artistDashboard);
router.get("/:id", releaseController.getRelease);
router.post("/", requireAuth, releaseUpload, requireFields(["title", "type", "genre", "category", "country"]), releaseController.createRelease);
router.put("/:id", requireAuth, releaseUpload, releaseController.editRelease);
router.delete("/:id", requireAuth, releaseController.deleteRelease);

module.exports = router;