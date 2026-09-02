const ApiError = require("../utils/apiError");
const db = require("../config/db");
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

async function trackListenForTrack(req, res, next) {
  try {
    const trackId = parseReleaseId(req.params.trackId);
    const sessionId = String(req.body.sessionId || "").trim();
    const elapsedSeconds = Number(req.body.elapsedSeconds);
    if (!sessionId || sessionId.length > 200) throw new ApiError(400, "A valid listening session id is required");
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 30) {
      throw new ApiError(422, "Track listens require at least 30 seconds");
    }

    const requestedReleaseId = req.params.releaseId || req.body.releaseId || null;
    const track = await releaseModel.getTrackById(trackId, requestedReleaseId ? parseReleaseId(requestedReleaseId) : null);
    if (!track) throw new ApiError(404, "Track not found");

    const client = await db.getClient();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO track_listens (track_id, user_id, session_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (track_id, session_id) DO NOTHING
         RETURNING id`,
        [trackId, req.user?.id || null, sessionId]
      );
      if (inserted.rows.length) {
        await client.query(
          "UPDATE release_tracks SET listen_count = listen_count + 1 WHERE id = $1",
          [trackId]
        );
      }
      await client.query("COMMIT");
      res.json({ success: true, recorded: inserted.rows.length > 0, message: inserted.rows.length ? "Track listen tracked" : "Track listen already tracked" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
  trackListenForTrack,
  trackView
};