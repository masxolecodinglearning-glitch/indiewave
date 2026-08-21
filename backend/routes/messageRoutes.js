const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireFields } = require("../middleware/validators");
const messageController = require("../controllers/messageController");

const router = express.Router();

router.get("/conversations", requireAuth, messageController.listConversations);
router.post("/conversations/:userId", requireAuth, messageController.createOrOpenConversation);
router.get("/conversations/:conversationId/messages", requireAuth, messageController.getConversationMessages);
router.post("/conversations/:conversationId/messages", requireAuth, requireFields(["message"]), messageController.sendMessage);

module.exports = router;
