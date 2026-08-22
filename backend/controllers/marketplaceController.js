const ApiError = require("../utils/apiError");
const mkt = require("../models/marketplaceModel");
const r2 = require("../utils/r2");
const { folderForFile } = require("../utils/upload");

// Reuse the R2 upload helper pattern from releaseController
async function uploadImageToR2(file) {
  try {
    const folder = folderForFile(file.mimetype, false); // images go to "artwork"
    const key = r2.buildKey(folder, file.originalname);
    await r2.putObject(key, file.buffer, file.mimetype);
    return key;
  } catch (err) {
    console.error("R2 marketplace upload error:", err.message);
    throw new ApiError(502, "Image upload to storage failed. Please try again.");
  }
}

// ── Products ────────────────────────────────────────────────────────────────

async function listProducts(req, res, next) {
  try {
    const { category, seller_id, limit, offset } = req.query;
    const products = await mkt.listProducts({
      category: category || null,
      sellerId: seller_id ? Number(seller_id) : null,
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0
    });
    res.json({ success: true, products });
  } catch (err) { next(err); }
}

async function getProduct(req, res, next) {
  try {
    const product = await mkt.getProductById(Number(req.params.id));
    if (!product) throw new ApiError(404, "Product not found");
    res.json({ success: true, product });
  } catch (err) { next(err); }
}

async function createProduct(req, res, next) {
  try {
    const { title, description, price, currency, category, condition, stock_quantity, external_purchase_url, whatsapp_contact } = req.body;
    if (!title || !title.trim()) throw new ApiError(422, "Product title is required");
    if (Number(price) < 0) throw new ApiError(422, "Price cannot be negative");
    if (external_purchase_url && !/^https?:\/\//i.test(external_purchase_url))
      throw new ApiError(422, "External purchase URL must start with http(s)://");

    const imagePath = req.file ? await uploadImageToR2(req.file) : null;

    const product = await mkt.createProduct({
      sellerId: req.user.id,
      title: title.trim(),
      description: description || null,
      price: Number(price) || 0,
      currency: currency || "ZAR",
      category: category || "other",
      condition: condition || "new",
      stockQuantity: Number(stock_quantity) || 1,
      imagePath,
      externalPurchaseUrl: external_purchase_url || null,
      whatsappContact: whatsapp_contact || null
    });
    res.status(201).json({ success: true, product });
  } catch (err) { next(err); }
}

async function updateProduct(req, res, next) {
  try {
    const id = Number(req.params.id);
    const fields = {};
    ["title","description","price","currency","category","condition","status","external_purchase_url","whatsapp_contact"].forEach((f) => {
      if (req.body[f] !== undefined) fields[f] = req.body[f];
    });
    if (req.body.stock_quantity !== undefined) fields.stock_quantity = Number(req.body.stock_quantity);
    if (req.file) fields.image_path = await uploadImageToR2(req.file);

    const product = await mkt.updateProduct(id, req.user.id, fields);
    if (!product) throw new ApiError(404, "Product not found or not owned by you");
    res.json({ success: true, product });
  } catch (err) { next(err); }
}

async function deleteProduct(req, res, next) {
  try {
    const deleted = await mkt.deleteProduct(Number(req.params.id), req.user.id);
    if (!deleted) throw new ApiError(404, "Product not found or not owned by you");
    res.json({ success: true, message: "Product deleted" });
  } catch (err) { next(err); }
}

// ── Events ──────────────────────────────────────────────────────────────────

async function listEvents(req, res, next) {
  try {
    const { status, owner_id, limit, offset } = req.query;
    const requestedOwnerId = owner_id ? Number(owner_id) : null;
    const safeOwnerId = req.user && requestedOwnerId && Number(req.user.id) === requestedOwnerId ? requestedOwnerId : null;

    const events = await mkt.listEvents({
      status: status || null,
      ownerId: safeOwnerId,
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0
    });
    res.json({ success: true, events });
  } catch (err) { next(err); }
}

async function listMyEvents(req, res, next) {
  try {
    const events = await mkt.listEvents({ ownerId: req.user.id });
    res.json({ success: true, events });
  } catch (err) { next(err); }
}

async function getEvent(req, res, next) {
  try {
    const event = await mkt.getEventById(Number(req.params.id));
    if (!event) throw new ApiError(404, "Event not found");
    res.json({ success: true, event });
  } catch (err) { next(err); }
}

async function createEvent(req, res, next) {
  try {
    const { title, description, event_date, start_time, end_time, venue_name, location,
            facebook_url, tiktok_url, instagram_url, website_url, whatsapp_url, ticket_url,
            ticket_provider, ticket_price, ticket_currency, status } = req.body;

    if (!title || !title.trim()) throw new ApiError(422, "Event title is required");
    if (!event_date) throw new ApiError(422, "Event date is required");

    const urlFields = { facebook_url, tiktok_url, instagram_url, website_url, whatsapp_url, ticket_url };
    for (const [field, val] of Object.entries(urlFields)) {
      if (val && !/^https?:\/\//i.test(val) && !/^wa\.me/i.test(val))
        throw new ApiError(422, `${field} must be a valid URL`);
    }

    const posterPath = req.file ? await uploadImageToR2(req.file) : null;

    const event = await mkt.createEvent({
      ownerId: req.user.id,
      title: title.trim(), description, eventDate: event_date,
      startTime: start_time || null, endTime: end_time || null,
      venueName: venue_name || null, location: location || null,
      posterPath, facebookUrl: facebook_url || null, tiktokUrl: tiktok_url || null,
      instagramUrl: instagram_url || null,
      websiteUrl: website_url || null, whatsappUrl: whatsapp_url || null,
      ticketUrl: ticket_url || null, ticketProvider: ticket_provider || null,
      ticketPrice: ticket_price ? Number(ticket_price) : null,
      ticketCurrency: ticket_currency || "ZAR",
      qrCodePath: null, status: status || "upcoming"
    });
    res.status(201).json({ success: true, event });
  } catch (err) { next(err); }
}

async function updateEvent(req, res, next) {
  try {
    const id = Number(req.params.id);
    const current = await mkt.getEventById(id);
    if (!current) throw new ApiError(404, "Event not found");
    if (Number(current.owner_id) !== Number(req.user.id)) {
      throw new ApiError(403, "You are not allowed to edit this event");
    }

    const allowed = ["title","description","event_date","start_time","end_time","venue_name","location","facebook_url","tiktok_url","instagram_url","website_url","whatsapp_url","ticket_url","ticket_provider","ticket_price","ticket_currency","status"];
    const fields = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) fields[f] = req.body[f]; });
    if (req.file) fields.poster_path = await uploadImageToR2(req.file);

    const event = await mkt.updateEvent(id, req.user.id, fields);
    if (!event) throw new ApiError(404, "Event not found");
    res.json({ success: true, event });
  } catch (err) { next(err); }
}

async function deleteEvent(req, res, next) {
  try {
    const id = Number(req.params.id);
    const current = await mkt.getEventById(id);
    if (!current) throw new ApiError(404, "Event not found");
    if (Number(current.owner_id) !== Number(req.user.id)) {
      throw new ApiError(403, "You are not allowed to delete this event");
    }

    const deleted = await mkt.deleteEvent(id, req.user.id);
    if (!deleted) throw new ApiError(404, "Event not found");
    res.json({ success: true, message: "Event deleted" });
  } catch (err) { next(err); }
}

// ── Comments ─────────────────────────────────────────────────────────────────

async function listComments(req, res, next) {
  try {
    const { type, id } = req.params;
    if (!["product","event"].includes(type)) throw new ApiError(400, "Invalid target type");
    const comments = await mkt.listComments(type, Number(id));
    res.json({ success: true, comments });
  } catch (err) { next(err); }
}

async function addComment(req, res, next) {
  try {
    const { type, id } = req.params;
    if (!["product","event"].includes(type)) throw new ApiError(400, "Invalid target type");
    const content = String(req.body.content || "").trim();
    if (!content) throw new ApiError(422, "Comment cannot be empty");
    if (content.length > 2000) throw new ApiError(422, "Comment is too long");
    const comment = await mkt.addComment(req.user.id, type, Number(id), content);
    res.status(201).json({ success: true, comment });
  } catch (err) { next(err); }
}

// ── Reactions ────────────────────────────────────────────────────────────────

async function getReactions(req, res, next) {
  try {
    const { type, id } = req.params;
    if (!["product","event"].includes(type)) throw new ApiError(400, "Invalid target type");
    const reactions = await mkt.getReactions(type, Number(id));
    res.json({ success: true, reactions });
  } catch (err) { next(err); }
}

async function react(req, res, next) {
  try {
    const { type, id } = req.params;
    if (!["product","event"].includes(type)) throw new ApiError(400, "Invalid target type");
    const validEmojis = ["❤️","😂","🔥","👍"];
    const emoji = String(req.body.emoji || "").trim();
    if (!validEmojis.includes(emoji)) throw new ApiError(422, "Invalid emoji reaction");
    const result = await mkt.toggleReaction(req.user.id, type, Number(id), emoji);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

module.exports = {
  listProducts, getProduct, createProduct, updateProduct, deleteProduct,
  listEvents, listMyEvents, getEvent, createEvent, updateEvent, deleteEvent,
  listComments, addComment, getReactions, react
};
