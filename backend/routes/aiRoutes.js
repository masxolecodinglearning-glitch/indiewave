const express = require("express");
const { requireAuth } = require("../middleware/auth");
const aiController = require("../controllers/aiController");

const router = express.Router();

router.post("/chat", requireAuth, aiController.chat);
router.get("/conversations", requireAuth, aiController.listConversations);
router.post("/conversations", requireAuth, aiController.createConversation);
router.get("/conversations/:id", requireAuth, aiController.getConversation);
router.delete("/conversations/:id", requireAuth, aiController.deleteConversation);
router.post("/bio", requireAuth, aiController.generateBio);
router.post("/marketing-caption", requireAuth, aiController.marketingCaption);

module.exports = router;
