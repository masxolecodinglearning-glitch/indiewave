const express = require("express");
const { requireAuth } = require("../middleware/auth");
const aiController = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", requireAuth, aiController.chat);
router.post("/bio", requireAuth, aiController.generateBio);
router.post("/marketing-caption", requireAuth, aiController.marketingCaption);

module.exports = router;
