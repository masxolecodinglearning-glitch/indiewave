const express = require("express");
const { requireAuth } = require("../middleware/auth");
const artistController = require("../controllers/artistController");
const { upload } = require("../utils/upload");

const router = express.Router();

router.put("/me/update", requireAuth, artistController.updateMyProfile);
router.post("/me/profile-image", requireAuth, upload.single("profileImage"), artistController.uploadProfileImage);
router.get("/:slug", artistController.getArtistProfile);

module.exports = router;