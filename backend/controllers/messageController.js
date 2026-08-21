const ApiError = require("../utils/apiError");
const messageModel = require("../models/messageModel");
const userModel = require("../models/userModel");
const notificationModel = require("../models/notificationModel");

async function listConversations(req, res, next) {
  try {
    const conversations = await messageModel.listConversations(req.user.id);
    res.json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
}

async function createOrOpenConversation(req, res, next) {
  try {
    const otherUserId = Number(req.params.userId);
    if (!otherUserId || otherUserId === req.user.id) {
      throw new ApiError(400, "A valid conversation partner is required");
    }

    const otherUser = await userModel.findById(otherUserId);
    if (!otherUser) {
      throw new ApiError(404, "User not found");
    }

    const conversation = await messageModel.getOrCreateConversation(req.user.id, otherUserId);
    res.status(201).json({ success: true, conversation, otherUser });
  } catch (error) {
    next(error);
  }
}

async function getConversationMessages(req, res, next) {
  try {
    const conversationId = Number(req.params.conversationId);
    if (!conversationId) {
      throw new ApiError(400, "Conversation ID is required");
    }

    const messages = await messageModel.getMessagesForConversation(req.user.id, conversationId);
    await messageModel.markConversationRead(req.user.id, conversationId);
    res.json({ success: true, messages });
  } catch (error) {
    next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    const conversationId = Number(req.params.conversationId);
    if (!conversationId) {
      throw new ApiError(400, "Conversation ID is required");
    }

    const message = await messageModel.sendMessage({
      conversationId,
      senderId: req.user.id,
      message: req.body.message
    });

    const recipient = await messageModel.getConversationRecipient(conversationId, req.user.id);
    if (recipient && recipient.id !== req.user.id) {
      await notificationModel.createNotification({
        userId: recipient.id,
        type: "message",
        message: `${req.user.stage_name || req.user.name || "Someone"} sent you a message`,
        relatedId: conversationId
      });
    }

    res.status(201).json({ success: true, message });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listConversations,
  createOrOpenConversation,
  getConversationMessages,
  sendMessage
};
