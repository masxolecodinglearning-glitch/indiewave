const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { upload } = require("../utils/upload");
const ctrl = require("../controllers/marketplaceController");

const router = express.Router();
const imageUpload = upload.single("image");

// Products
router.get("/products", ctrl.listProducts);
router.get("/products/:id", ctrl.getProduct);
router.post("/products", requireAuth, imageUpload, ctrl.createProduct);
router.put("/products/:id", requireAuth, imageUpload, ctrl.updateProduct);
router.delete("/products/:id", requireAuth, ctrl.deleteProduct);

// Events
router.get("/events", ctrl.listEvents);
router.get("/events/:id", ctrl.getEvent);
router.post("/events", requireAuth, imageUpload, ctrl.createEvent);
router.put("/events/:id", requireAuth, imageUpload, ctrl.updateEvent);
router.delete("/events/:id", requireAuth, ctrl.deleteEvent);

// Comments (shared: type = product | event)
router.get("/:type/:id/comments", ctrl.listComments);
router.post("/:type/:id/comments", requireAuth, ctrl.addComment);

// Reactions (shared)
router.get("/:type/:id/reactions", ctrl.getReactions);
router.post("/:type/:id/reactions", requireAuth, ctrl.react);

module.exports = router;
