const ApiError = require("../utils/apiError");
const releaseModel = require("../models/releaseModel");

async function trackDownload(req, res, next) {
  try {
    const releaseId = Number(req.params.releaseId);
    const release = await releaseModel.getReleaseById(releaseId);
    if (!release) throw new ApiError(404, "Release not found");

    await releaseModel.incrementCounter(releaseId, "download_count");
    res.json({ success: true, message: "Download tracked", filePath: release.media_audio_path || release.media_video_path });
  } catch (error) {
    next(error);
  }
}

async function trackListen(req, res, next) {
  try {
    const releaseId = Number(req.params.releaseId);
    const release = await releaseModel.getReleaseById(releaseId);
    if (!release) throw new ApiError(404, "Release not found");

    await releaseModel.incrementCounter(releaseId, "listen_count");
    res.json({ success: true, message: "Listen tracked" });
  } catch (error) {
    next(error);
  }
}

async function trackView(req, res, next) {
  try {
    const releaseId = Number(req.params.releaseId);
    const release = await releaseModel.getReleaseById(releaseId);
    if (!release) throw new ApiError(404, "Release not found");

    const metric = release.type === "video" || release.media_video_path ? "video_view_count" : "view_count";
    await releaseModel.incrementCounter(releaseId, metric);
    res.json({ success: true, message: "View tracked" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  trackDownload,
  trackListen,
  trackView
};