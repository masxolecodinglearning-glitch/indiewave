const ApiError = require("../utils/apiError");

function notFound(req, res, next) {
  next(new ApiError(404, "Route not found"));
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const payload = {
    success: false,
    message: err.message || "Internal Server Error"
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json(payload);
}

module.exports = {
  notFound,
  errorHandler
};