const ApiError = require("../utils/apiError");
const userModel = require("../models/userModel");
const releaseModel = require("../models/releaseModel");
const { toRelativePath } = require("../utils/upload");

async function getArtistProfile(req, res, next) {
  try {
    const artist = await userModel.findBySlug(req.params.slug);
    if (!artist) throw new ApiError(404, "Artist not found");

    const stats = await userModel.getArtistStats(artist.id);
    const releases = await releaseModel.listArtistReleases(artist.id);

    res.json({ success: true, artist, stats, releases });
  } catch (error) {
    next(error);
  }
}

async function updateMyProfile(req, res, next) {
  try {
    const payload = {};
    const editable = ["name", "stage_name", "country", "genre", "bio"];

    editable.forEach((field) => {
      if (req.body[field] !== undefined) payload[field] = req.body[field];
    });

    const updated = await userModel.updateUser(req.user.id, payload);
    res.json({ success: true, user: updated });
  } catch (error) {
    next(error);
  }
}

async function uploadProfileImage(req, res, next) {
  try {
    if (!req.file) throw new ApiError(422, "Profile image is required");

    const profilePath = toRelativePath(req.file.path);
    const updated = await userModel.updateUser(req.user.id, { profile_image: profilePath });

    res.json({ success: true, user: updated });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getArtistProfile,
  updateMyProfile,
  uploadProfileImage
};