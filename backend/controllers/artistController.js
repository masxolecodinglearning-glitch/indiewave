const ApiError = require("../utils/apiError");
const userModel = require("../models/userModel");
const releaseModel = require("../models/releaseModel");
const r2 = require("../utils/r2");

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

    let profileKey;
    try {
      const key = r2.buildKey("profiles", req.file.originalname);
      await r2.putObject(key, req.file.buffer, req.file.mimetype);
      profileKey = key;
    } catch (err) {
      console.error("R2 profile image upload error:", err.message);
      throw new ApiError(502, "Profile image upload to storage failed. Please try again.");
    }

    const updated = await userModel.updateUser(req.user.id, { profile_image: profileKey });

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