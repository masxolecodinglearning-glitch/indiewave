const ApiError = require("../utils/apiError");
const liveModel = require("../models/liveModel");
const r2 = require("../utils/r2");

async function createLivePerformance(req, res, next) {
  try {
    const { title, description, scheduledAt } = req.body;
    let replayPath = null;
    if (req.file) {
      try {
        const key = r2.buildKey("video", req.file.originalname);
        await r2.putObject(key, req.file.buffer, req.file.mimetype);
        replayPath = key;
      } catch (err) {
        console.error("R2 replay upload error:", err.message);
        throw new ApiError(502, "Replay video upload to storage failed. Please try again.");
      }
    }

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