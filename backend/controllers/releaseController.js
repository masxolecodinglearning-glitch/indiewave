const ApiError = require("../utils/apiError");
const releaseModel = require("../models/releaseModel");
const { toRelativePath } = require("../utils/upload");

const releaseTypes = ["single", "ep", "album", "mixtape", "dj_mix", "video", "live_performance"];

async function createRelease(req, res, next) {
  try {
    const { title, description, type, genre, category, country, scheduledAt, replayAvailable } = req.body;

    if (!releaseTypes.includes(type)) {
      throw new ApiError(422, "Invalid release type");
    }

    const files = req.files || {};
    const audio = files.audio?.[0];
    const video = files.video?.[0];
    const artwork = files.artwork?.[0];

    if (!audio && !video) {
      throw new ApiError(422, "At least one media file (audio or video) is required");
    }

    const release = await releaseModel.createRelease({
      artistId: req.user.id,
      title,
      description,
      type,
      genre,
      category,
      country,
      artworkPath: artwork ? toRelativePath(artwork.path) : null,
      mediaAudioPath: audio ? toRelativePath(audio.path) : null,
      mediaVideoPath: video ? toRelativePath(video.path) : null,
      scheduledAt: scheduledAt || null,
      replayAvailable: replayAvailable === "true" || replayAvailable === true
    });

    res.status(201).json({ success: true, release });
  } catch (error) {
    next(error);
  }
}

async function editRelease(req, res, next) {
  try {
    const releaseId = Number(req.params.id);
    const payload = {};

    ["title", "description", "type", "genre", "category", "country", "scheduled_at", "replay_available"].forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    });

    if (req.files?.audio?.[0]) payload.media_audio_path = toRelativePath(req.files.audio[0].path);
    if (req.files?.video?.[0]) payload.media_video_path = toRelativePath(req.files.video[0].path);
    if (req.files?.artwork?.[0]) payload.artwork_path = toRelativePath(req.files.artwork[0].path);

    const release = await releaseModel.updateRelease(releaseId, req.user.id, payload);
    if (!release) throw new ApiError(404, "Release not found");

    res.json({ success: true, release });
  } catch (error) {
    next(error);
  }
}

async function deleteRelease(req, res, next) {
  try {
    const releaseId = Number(req.params.id);
    const deleted = await releaseModel.softDeleteRelease(releaseId, req.user.id);
    if (!deleted) throw new ApiError(404, "Release not found");
    res.json({ success: true, message: "Release deleted" });
  } catch (error) {
    next(error);
  }
}

async function getRelease(req, res, next) {
  try {
    const release = await releaseModel.getReleaseById(Number(req.params.id));
    if (!release) throw new ApiError(404, "Release not found");
    res.json({ success: true, release });
  } catch (error) {
    next(error);
  }
}

async function listReleases(req, res, next) {
  try {
    const releases = await releaseModel.listReleases({
      sort: req.query.sort,
      type: req.query.type,
      genre: req.query.genre,
      country: req.query.country,
      category: req.query.category,
      q: req.query.q,
      limit: Number(req.query.limit || 20),
      offset: Number(req.query.offset || 0)
    });

    res.json({ success: true, releases });
  } catch (error) {
    next(error);
  }
}

async function artistDashboard(req, res, next) {
  try {
    const releases = await releaseModel.listArtistReleases(req.user.id);
    res.json({ success: true, releases });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createRelease,
  editRelease,
  deleteRelease,
  getRelease,
  listReleases,
  artistDashboard
};