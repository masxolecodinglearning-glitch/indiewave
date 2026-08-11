const express = require("express");
const { requireAuth } = require("../middleware/auth");
const notificationController = require("../controllers/notificationController");

const router = express.Router();

router.get("/", requireAuth, notificationController.list);
router.patch("/:notificationId/read", requireAuth, notificationController.read);

module.exports = router;