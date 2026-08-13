const fs = require("fs");
const path = require("path");
const multer = require("multer");
const env = require("../config/env");

const projectRoot = path.resolve(__dirname, "../..");
const uploadRoot = path.resolve(projectRoot, env.upload.root);

const folders = {
  audio: path.join(uploadRoot, "audio"),
  video: path.join(uploadRoot, "video"),
  artwork: path.join(uploadRoot, "artwork"),
  profiles: path.join(uploadRoot, "profiles")
};

Object.values(folders).forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
});

// Use memory storage so the buffer can be forwarded to Cloudflare R2.
// Legacy local folders above are kept solely for express.static backward compat.
const storage = multer.memoryStorage();

const allowed = {
  "audio/mpeg": true,
  "audio/mp3": true,
  "video/mp4": true,
  "image/png": true,
  "image/jpeg": true,
  "image/jpg": true,
  "image/webp": true
};

const upload = multer({
  storage,
  limits: { fileSize: env.upload.maxMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowed[file.mimetype]) {
      cb(new Error("Invalid file type. Only MP3, MP4, PNG, JPG, JPEG, WEBP are allowed."));
      return;
    }
    cb(null, true);
  }
});

/**
 * Determine the R2 folder for a file based on its MIME type.
 * @param {string}  mimetype   - file MIME type
 * @param {boolean} isProfile  - true when uploading a profile image
 * @returns {string}  one of "audio" | "video" | "artwork" | "profiles"
 */
function folderForFile(mimetype, isProfile = false) {
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("image/")) return isProfile ? "profiles" : "artwork";
  throw new Error("Unsupported file type");
}

function toRelativePath(absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
}

module.exports = {
  upload,
  toRelativePath,
  folderForFile
};