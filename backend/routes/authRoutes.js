const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireFields } = require("../middleware/validators");
const authController = require("../controllers/authController");

const router = express.Router();

router.post(
  "/register",
  requireFields(["name", "email", "password", "stageName", "country", "genre", "acceptTerms"]),
  authController.register
);
router.post("/login", requireFields(["email", "password"]), authController.login);
router.get("/me", requireAuth, authController.me);
router.post("/terms", requireAuth, authController.acceptTerms);

module.exports = router;