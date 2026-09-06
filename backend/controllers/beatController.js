const ApiError = require("../utils/apiError");
const beatModel = require("../models/beatModel");
const r2 = require("../utils/r2");
const { folderForFile } = require("../utils/upload");
const { normalizePrice, commissionFor } = require("../utils/creatorPolicy");

async function uploadToR2(file) {
  const key = r2.buildKey(folderForFile(file.mimetype, false), file.originalname);
  await r2.putObject(key, file.buffer, file.mimetype);
  return key;
}

async function listBeats(req, res, next) {
  try {
    const beats = await beatModel.listBeats({
      limit: Math.min(Number(req.query.limit) || 50, 100),
      offset: Number(req.query.offset) || 0
    });
    res.json({ success: true, beats });
  } catch (error) {
    next(error);
  }
}

async function createBeat(req, res, next) {
  try {
    const { title, description, genre, price, currency, rightsConfirmed } = req.body;
    const audio = req.files?.audio?.[0];
    const artwork = req.files?.artwork?.[0];
    const normalizedPrice = normalizePrice(price);
    if (!title?.trim() || !genre?.trim()) throw new ApiError(422, "Beat title and genre are required.");
    if (!audio) throw new ApiError(422, "Beat audio is required.");
    if (!artwork) throw new ApiError(422, "Artwork is required before this beat can be uploaded.");
    if (rightsConfirmed !== true && rightsConfirmed !== "true" && rightsConfirmed !== "on") {
      throw new ApiError(422, "You must confirm ownership or permission for this beat, mix, recording, and included content.");
    }
    if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) throw new ApiError(422, "A valid non-negative beat price is required.");

    const beat = await beatModel.createBeat({
      sellerId: req.user.id,
      title: title.trim(),
      description,
      genre: genre.trim(),
      audioPath: await uploadToR2(audio),
      artworkPath: await uploadToR2(artwork),
      price: normalizedPrice,
      currency
    });
    res.status(201).json({ success: true, beat, commission: commissionFor("beat", normalizedPrice) });
  } catch (error) {
    next(error);
  }
}

module.exports = { listBeats, createBeat };
