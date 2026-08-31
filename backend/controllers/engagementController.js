const ApiError = require("../utils/apiError");
const releaseModel = require("../models/releaseModel");
const r2 = require("../utils/r2");

function parseReleaseId(value) {
  const releaseId = Number.parseInt(String(value), 10);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    throw new ApiError(400, "Invalid release id");
  }
  return releaseId;
}

function sanitizeFilenamePart(value) {
  return String(value || "release")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "release";
}

function resolveDownloadKey(release) {
  if (!release || release.content_type !== "upload") {
    throw new ApiError(422, "Only IndieWave uploaded releases can be downloaded");
  }

  const preferred = release.type === "video"
    ? release.media_video_path || release.media_audio_path
    : release.media_audio_path || release.media_video_path;

  const key = String(preferred || "").trim().replace(/\\/g, "/");
  if (!key) {
    throw new ApiError(404, "No downloadable media found for this release");
  }

  if (!/^(audio|video)\/[a-zA-Z0-9._-]+$/.test(key)) {
    throw new ApiError(403, "Invalid media path");
  }

  return key;
}

function buildDownloadUrl(req, releaseId) {
  return `${req.protocol}://${req.get("host")}/api/engagement/releases/${releaseId}/download`;
}

async function trackDownload(req, res, next) {
  try {
    const releaseId = parseReleaseId(req.params.releaseId);

    const release = await releaseModel.getReleaseById(releaseId);
    if (!release) throw new ApiError(404, "Release not found");
    resolveDownloadKey(release);

    await releaseModel.incrementCounter(releaseId, "download_count");
    res.json({
      success: true,
      message: "Download ready",
      downloadUrl: buildDownloadUrl(req, releaseId)
    });
  } catch (error) {
    next(error);
  }
}

async function downloadRelease(req, res, next) {
  try {
    const releaseId = parseReleaseId(req.params.releaseId);

    const release = await releaseModel.getReleaseById(releaseId);
    if (!release) throw new ApiError(404, "Release not found");

    const key = resolveDownloadKey(release);
    const obj = await r2.getObject(key);
    const extensionMatch = key.match(/(\.[a-z0-9]+)$/i);
    const extension = extensionMatch ? extensionMatch[1] : "";
    const fileName = `${sanitizeFilenamePart(release.title)}-${releaseId}${extension}`;

    res.setHeader("Content-Type", obj.ContentType || "application/octet-stream");
    if (obj.ContentLength) res.setHeader("Content-Length", obj.ContentLength);
    res.setHeader("Content-Disposition", `attachment; filename=\"${fileName}\"`);

    obj.Body.pipe(res);
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return next(new ApiError(404, "Media not found"));
    }
    next(error);
  }
}

async function trackListen(req, res, next) {
  try {
    const releaseId = parseReleaseId(req.params.releaseId);
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
    const releaseId = parseReleaseId(req.params.releaseId);
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
  downloadRelease,
  trackListen,
  trackView
};