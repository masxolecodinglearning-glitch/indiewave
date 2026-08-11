const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireFields } = require("../middleware/validators");
const socialController = require("../controllers/socialController");

const router = express.Router();

router.post("/artists/:artistId/follow", requireAuth, socialController.followArtist);
router.post("/releases/:releaseId/like", requireAuth, socialController.likeRelease);
router.post("/releases/:releaseId/comments", requireAuth, requireFields(["content"]), socialController.addComment);
router.get("/releases/:releaseId/comments", socialController.listComments);

module.exports = router;