const ApiError = require("../utils/apiError");
const socialModel = require("../models/socialModel");
const releaseModel = require("../models/releaseModel");
const notificationModel = require("../models/notificationModel");

async function followArtist(req, res, next) {
  try {
    const artistId = Number(req.params.artistId);
    const result = await socialModel.toggleFollow(req.user.id, artistId);

    if (result.followed) {
      await notificationModel.createNotification({
        userId: artistId,
        type: "follow",
        message: "You have a new follower.",
        relatedId: req.user.id
      });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

async function likeRelease(req, res, next) {
  try {
    const releaseId = Number(req.params.releaseId);
    const release = await releaseModel.getReleaseById(releaseId);
    if (!release) throw new ApiError(404, "Release not found");

    const result = await socialModel.toggleLike(req.user.id, releaseId);

    if (result.liked && release.artist_id !== req.user.id) {
      await notificationModel.createNotification({
        userId: release.artist_id,
        type: "like",
        message: `Your release \"${release.title}\" got a new like.`,
        relatedId: releaseId
      });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

async function addComment(req, res, next) {
  try {
    const releaseId = Number(req.params.releaseId);
    const release = await releaseModel.getReleaseById(releaseId);
    if (!release) throw new ApiError(404, "Release not found");

    const comment = await socialModel.addComment(req.user.id, releaseId, req.body.content);

    if (release.artist_id !== req.user.id) {
      await notificationModel.createNotification({
        userId: release.artist_id,
        type: "comment",
        message: `New comment on \"${release.title}\".`,
        relatedId: releaseId
      });
    }

    res.status(201).json({ success: true, comment });
  } catch (error) {
    next(error);
  }
}

async function listComments(req, res, next) {
  try {
    const comments = await socialModel.getComments(Number(req.params.releaseId));
    res.json({ success: true, comments });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  followArtist,
  likeRelease,
  addComment,
  listComments
};