const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireFields } = require("../middleware/validators");
const { upload } = require("../utils/upload");
const beatController = require("../controllers/beatController");

const router = express.Router();
const beatUpload = upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "artwork", maxCount: 1 }
]);

router.get("/", beatController.listBeats);
router.post(
  "/",
  requireAuth,
  beatUpload,
  requireFields(["title", "genre", "price", "rightsConfirmed"]),
  beatController.createBeat
);

module.exports = router;
