const notificationModel = require("../models/notificationModel");
const ApiError = require("../utils/apiError");

async function list(req, res, next) {
  try {
    const notifications = await notificationModel.listNotifications(req.user.id);
    res.json({ success: true, notifications });
  } catch (error) {
    next(error);
  }
}

async function read(req, res, next) {
  try {
    const notification = await notificationModel.markRead(req.user.id, Number(req.params.notificationId));
    if (!notification) throw new ApiError(404, "Notification not found");
    res.json({ success: true, notification });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  read
};