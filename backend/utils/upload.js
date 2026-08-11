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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) {
      cb(null, folders.audio);
      return;
    }

    if (file.mimetype.startsWith("video/")) {
      cb(null, folders.video);
      return;
    }

    if (file.mimetype.startsWith("image/")) {
      const isProfileUpload = req.originalUrl.includes("profile-image");
      cb(null, isProfileUpload ? folders.profiles : folders.artwork);
      return;
    }

    cb(new Error("Unsupported file type"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = file.originalname
      .replace(ext, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 50);
    cb(null, `${Date.now()}-${safeName}${ext}`);
  }
});

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

function toRelativePath(absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
}

module.exports = {
  upload,
  toRelativePath
};