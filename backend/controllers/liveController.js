const ApiError = require("../utils/apiError");
const liveModel = require("../models/liveModel");
const { toRelativePath } = require("../utils/upload");

async function createLivePerformance(req, res, next) {
  try {
    const { title, description, scheduledAt } = req.body;
    const replayPath = req.file ? toRelativePath(req.file.path) : null;

    const performance = await liveModel.createPerformance({
      artistId: req.user.id,
      title,
      description,
      scheduledAt,
      replayPath
    });

    res.status(201).json({ success: true, performance });
  } catch (error) {
    next(error);
  }
}

async function listLivePerformances(req, res, next) {
  try {
    const performances = await liveModel.listUpcoming();
    res.json({ success: true, performances });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createLivePerformance,
  listLivePerformances
};