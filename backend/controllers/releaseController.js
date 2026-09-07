const ApiError = require("../utils/apiError");
const releaseModel = require("../models/releaseModel");
const analyticsModel = require("../models/analyticsModel");
const { freshness, growth, releaseMovement } = require("../utils/analytics");
const r2 = require("../utils/r2");
const { folderForFile } = require("../utils/upload");
const { detectAndExtractEmbed } = require("../utils/embed");
const userModel = require("../models/userModel");
const { TERMS_VERSION, MUSIC_TYPES, normalizePrice, validateMusicPrice } = require("../utils/creatorPolicy");

const releaseTypes = ["single", "ep", "album", "mixtape", "dj_mix", "video", "live_performance"];

function parsePositiveId(value, label = "id") {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, `${label} must be a positive integer`);
  }
  return parsed;
}

/**
 * Upload a multer memory-storage file to R2 and return the stored object key.
 * Throws ApiError(502) if the R2 upload fails, preventing a broken DB record.
 */
async function uploadFileToR2(file, isProfile = false) {
  try {
    const folder = folderForFile(file.mimetype, isProfile);
    const key = r2.buildKey(folder, file.originalname);
    await r2.putObject(key, file.buffer, file.mimetype);
    return key;
  } catch (err) {
    console.error("R2 upload error:", err.message);
    throw new ApiError(502, "Media upload to storage failed. Please try again.");
  }
}

function buildFallbackTrack(release) {
  return {
    id: null,
    release_id: Number(release.id),
    track_number: 1,
    title: release.title,
    audio_path: release.media_audio_path,
    duration: null,
    created_at: release.created_at
  };
}

function normalizeTrackTitles(rawTrackTitles, totalFiles) {
  const values = [];
  const rawList = Array.isArray(rawTrackTitles) ? rawTrackTitles : (rawTrackTitles === undefined || rawTrackTitles === null ? [] : [rawTrackTitles]);

  rawList.forEach((entry) => {
    if (typeof entry === "string") {
      try {
        const parsed = JSON.parse(entry);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => values.push(item));
          return;
        }
      } catch (error) {
        // Ignore malformed JSON; treat as plain text below.
      }
      values.push(entry);
    } else if (entry !== null && entry !== undefined) {
      values.push(String(entry));
    }
  });

  return values.slice(0, totalFiles).map((value) => {
    const trimmed = String(value).trim();
    return trimmed || null;
  });
}

async function createRelease(req, res, next) {
  try {
    const { title, description, type, genre, category, country, scheduledAt, replayAvailable, embedUrl, contentType, price, currency, rightsConfirmed } = req.body;

    if (!releaseTypes.includes(type)) {
      throw new ApiError(422, "Invalid release type");
    }

    const currentUser = await userModel.findById(req.user.id);
    if (!currentUser || currentUser.terms_version !== TERMS_VERSION || !currentUser.terms_accepted_at) {
      throw new ApiError(403, "Please accept the current IndieWave Terms and Creator Policy before uploading.");
    }
    const normalizedPrice = normalizePrice(price === undefined || price === "" ? 0 : price);
    const priceError = MUSIC_TYPES.includes(type) ? validateMusicPrice(type, price) : null;
    if (priceError) throw new ApiError(422, priceError);
    const needsRights = MUSIC_TYPES.includes(type);
    if (needsRights && rightsConfirmed !== true && rightsConfirmed !== "true" && rightsConfirmed !== "on") {
      throw new ApiError(422, "You must confirm that you own this content or have the necessary rights, license, or permission.");
    }
    if (MUSIC_TYPES.includes(type) && !req.files?.artwork?.[0]) {
      throw new ApiError(422, "Artwork is required before this release can be uploaded.");
    }

    // Determine if this is an upload or embed
    const isEmbed = contentType === "embed" && embedUrl;

    if (isEmbed) {
      // Embed flow
      const embedData = detectAndExtractEmbed(embedUrl);
      if (!embedData) {
        throw new ApiError(422, "Invalid or unsupported embed URL. Supported: YouTube, Spotify, Ditto Pre-Save, DistroKid Pre-Save");
      }

      const release = await releaseModel.createRelease({
        artistId: req.user.id,
        title,
        description,
        type,
        genre,
        category,
        country,
        artworkPath: await uploadFileToR2(req.files.artwork[0]),
        mediaAudioPath: null,
        mediaVideoPath: null,
        scheduledAt: scheduledAt || null,
        replayAvailable: replayAvailable === "true" || replayAvailable === true,
        contentType: "embed",
        embedProvider: embedData.provider,
        embedUrl: embedData.normalizedUrl,
        embedId: embedData.embedId,
        price: normalizedPrice,
        currency,
        rightsConfirmed: needsRights
      });

      release.tracks = [];
      res.status(201).json({ success: true, release });
    } else {
      // Upload flow (keep the existing single release behavior while also storing track rows when audio files exist)
      const files = req.files || {};
      const audioFiles = Array.isArray(files.audio) ? files.audio : [];
      const video = files.video?.[0];
      const artwork = files.artwork?.[0];

      if (MUSIC_TYPES.includes(type) && !artwork) {
        throw new ApiError(422, "Artwork is required before this release can be uploaded.");
      }

      if (!audioFiles.length && !video) {
        throw new ApiError(422, "At least one media file (audio or video) is required");
      }

      const uploadedAudioPaths = [];
      for (const file of audioFiles) {
        uploadedAudioPaths.push(await uploadFileToR2(file));
      }

      const primaryAudioPath = uploadedAudioPaths[0] || null;
      const release = await releaseModel.createRelease({
        artistId: req.user.id,
        title,
        description,
        type,
        genre,
        category,
        country,
        artworkPath: artwork ? await uploadFileToR2(artwork) : null,
        mediaAudioPath: primaryAudioPath,
        mediaVideoPath: video ? await uploadFileToR2(video) : null,
        scheduledAt: scheduledAt || null,
        replayAvailable: replayAvailable === "true" || replayAvailable === true,
        contentType: "upload",
        embedProvider: null,
        embedUrl: null,
        embedId: null,
        price: normalizedPrice,
        currency,
        rightsConfirmed: needsRights
      });

      const rawTrackTitles = normalizeTrackTitles(req.body.trackTitles, audioFiles.length);
      const tracks = [];
      if (audioFiles.length > 0) {
        for (let index = 0; index < audioFiles.length; index += 1) {
          const file = audioFiles[index];
          const audioPath = uploadedAudioPaths[index];
          const requestedTitle = rawTrackTitles[index];
          const trackTitle = requestedTitle || (file.originalname ? file.originalname.replace(/\.[^/.]+$/, "") : `${title} ${index + 1}`);
          const track = await releaseModel.createTrack({
            releaseId: release.id,
            trackNumber: index + 1,
            title: trackTitle,
            audioPath,
            duration: null
          });
          tracks.push(track);
        }
      } else if (release.media_audio_path) {
        tracks.push(buildFallbackTrack(release));
      }

      release.tracks = tracks;
      res.status(201).json({ success: true, release });
    }
  } catch (error) {
    next(error);
  }
}

async function editRelease(req, res, next) {
  try {
    const releaseId = parsePositiveId(req.params.id, "Release id");
    const existingRelease = await releaseModel.getReleaseById(releaseId);
    if (!existingRelease) throw new ApiError(404, "Release not found");
    const { embedUrl, contentType } = req.body;
    const payload = {};

    ["title", "description", "type", "genre", "category", "country", "scheduled_at", "replay_available"].forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    });
    if (req.body.price !== undefined) {
      const priceError = validateMusicPrice(req.body.type || existingRelease.type, req.body.price);
      if (priceError) throw new ApiError(422, priceError);
      payload.price = normalizePrice(req.body.price);
    }
    if (req.body.currency !== undefined) payload.currency = req.body.currency;

    // Handle embed URL update if provided
    if (embedUrl && contentType === "embed") {
      const embedData = detectAndExtractEmbed(embedUrl);
      if (!embedData) {
        throw new ApiError(422, "Invalid or unsupported embed URL. Supported: YouTube, Spotify, Ditto Pre-Save, DistroKid Pre-Save");
      }
      payload.content_type = "embed";
      payload.embed_provider = embedData.provider;
      payload.embed_url = embedData.normalizedUrl;
      payload.embed_id = embedData.embedId;
    }

    // Handle file uploads for non-embed content
    if (req.files?.audio?.[0]) payload.media_audio_path = await uploadFileToR2(req.files.audio[0]);
    if (req.files?.video?.[0]) payload.media_video_path = await uploadFileToR2(req.files.video[0]);
    if (req.files?.artwork?.[0]) payload.artwork_path = await uploadFileToR2(req.files.artwork[0]);

    const release = await releaseModel.updateRelease(releaseId, req.user.id, payload);
    if (!release) throw new ApiError(404, "Release not found");

    res.json({ success: true, release });
  } catch (error) {
    next(error);
  }
}

async function deleteRelease(req, res, next) {
  try {
    const releaseId = parsePositiveId(req.params.id, "Release id");
    const deleted = await releaseModel.softDeleteRelease(releaseId, req.user.id);
    if (!deleted) throw new ApiError(404, "Release not found");
    res.json({ success: true, message: "Release deleted" });
  } catch (error) {
    next(error);
  }
}

async function getRelease(req, res, next) {
  try {
    const releaseId = parsePositiveId(req.params.id, "Release id");
    const release = await releaseModel.getReleaseById(releaseId, req.user?.id);
    if (!release) throw new ApiError(404, "Release not found");

    const tracks = await releaseModel.listTracksByRelease(releaseId);
    release.tracks = tracks.length ? tracks : (release.media_audio_path ? [buildFallbackTrack(release)] : []);
    const historical = await analyticsModel.getReleaseAnalytics(releaseId);
    const plays7d = Number(historical.plays_7d || 0);
    const views7d = Number(historical.views_7d || 0);
    const downloads7d = Number(historical.downloads_7d || 0);
    const likes7d = Number(historical.likes_7d || 0);
    release.analytics = {
      plays_7d: plays7d,
      views_7d: views7d,
      downloads_7d: downloads7d,
      likes_7d: likes7d,
      plays_previous_7d: Number(historical.plays_previous_7d || 0),
      views_previous_7d: Number(historical.views_previous_7d || 0),
      downloads_previous_7d: Number(historical.downloads_previous_7d || 0),
      likes_previous_7d: Number(historical.likes_previous_7d || 0),
      growth: {
        plays: growth(plays7d, historical.plays_previous_7d),
        views: growth(views7d, historical.views_previous_7d),
        downloads: growth(downloads7d, historical.downloads_previous_7d),
        likes: growth(likes7d, historical.likes_previous_7d)
      },
      freshness: freshness(release.created_at),
      movement: releaseMovement({
        plays: plays7d,
        views: views7d,
        downloads: downloads7d,
        likes: likes7d,
        freshnessScore: plays7d + views7d + downloads7d + likes7d > 0 ? freshness(release.created_at) : 0
      })
    };

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
      viewerId: req.user?.id,
      limit: Number(req.query.limit || 20),
      offset: Number(req.query.offset || 0)
    });

    for (const release of releases) {
      const tracks = await releaseModel.listTracksByRelease(release.id);
      release.tracks = tracks.length ? tracks : (release.media_audio_path ? [buildFallbackTrack(release)] : []);
    }

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