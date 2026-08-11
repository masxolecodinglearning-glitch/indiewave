const ApiError = require("../utils/apiError");
const { verifyToken } = require("../utils/jwt");

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new ApiError(401, "Authentication token is required"));
  }

  const token = authHeader.split(" ")[1];

  try {
    req.user = verifyToken(token);
    return next();
  } catch (error) {
    return next(new ApiError(401, "Invalid or expired token"));
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return next(new ApiError(403, "Admin privileges required"));
  }
  return next();
}

module.exports = {
  requireAuth,
  requireAdmin
};