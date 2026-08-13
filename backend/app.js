const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const env = require("./config/env");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const r2 = require("./utils/r2");

const app = express();
const allowedOrigins = new Set([
  env.frontendUrl,
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.use("/uploads", express.static(path.resolve(__dirname, "..", env.upload.root)));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "IndieWave API healthy" });
});

// ---------------------------------------------------------------------------
// R2 media streaming proxy
// Serves objects stored in Cloudflare R2 without exposing credentials.
// Supports HTTP Range requests so browsers can seek audio/video.
// Old local-filesystem paths continue to be served by express.static below.
// ---------------------------------------------------------------------------
app.get("/api/media/*", async (req, res, next) => {
  const key = req.params[0];
  if (!key) return res.status(400).json({ success: false, message: "Missing media key" });

  try {
    const rangeHeader = req.headers.range;
    const obj = await r2.getObject(key, rangeHeader);

    res.setHeader("Content-Type", obj.ContentType || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    if (obj.ContentLength) res.setHeader("Content-Length", obj.ContentLength);
    if (obj.ContentRange) res.setHeader("Content-Range", obj.ContentRange);
    if (rangeHeader && obj.ContentRange) res.status(206);

    // AWS SDK v3 returns a Node.js Readable stream as Body in Node.js runtime
    obj.Body.pipe(res);
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }
    console.error("R2 media fetch error:", err.message);
    next(err);
  }
});

app.use("/api", routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;