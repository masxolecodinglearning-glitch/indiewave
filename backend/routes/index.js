const express = require("express");
const authRoutes = require("./authRoutes");
const artistRoutes = require("./artistRoutes");
const releaseRoutes = require("./releaseRoutes");
const socialRoutes = require("./socialRoutes");
const engagementRoutes = require("./engagementRoutes");
const notificationRoutes = require("./notificationRoutes");
const liveRoutes = require("./liveRoutes");
const adminRoutes = require("./adminRoutes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/artists", artistRoutes);
router.use("/releases", releaseRoutes);
router.use("/social", socialRoutes);
router.use("/engagement", engagementRoutes);
router.use("/notifications", notificationRoutes);
router.use("/live", liveRoutes);
router.use("/admin", adminRoutes);

module.exports = router;