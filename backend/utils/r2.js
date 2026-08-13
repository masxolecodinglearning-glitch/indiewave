const path = require("path");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require("@aws-sdk/client-s3");

// Client is constructed lazily so missing env vars during local dev don't
// crash the process.  Actual calls will surface a clear error if unconfigured.
let _client = null;

function getClient() {
  if (!_client) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.ACCESS_KEY_ID;
    const secretAccessKey = process.env.SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.R2_BUCKET_NAME) {
      throw new Error(
        "R2 storage is not configured. Ensure R2_ENDPOINT, ACCESS_KEY_ID, " +
        "SECRET_ACCESS_KEY and R2_BUCKET_NAME are set as environment variables."
      );
    }

    _client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey }
    });
  }
  return _client;
}

function bucket() {
  return process.env.R2_BUCKET_NAME;
}

/**
 * Build a deterministic, URL-safe R2 object key.
 * @param {string} folder  - e.g. "audio", "video", "artwork", "profiles"
 * @param {string} originalname - original filename from the upload
 * @returns {string}  e.g. "audio/1786505817362-my-song.mp3"
 */
function buildKey(folder, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const base = path.basename(originalname, ext)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 50);
  return `${folder}/${Date.now()}-${base}${ext}`;
}

/**
 * Upload a file buffer to Cloudflare R2.
 * @param {string} key         - R2 object key (e.g. "audio/1234-song.mp3")
 * @param {Buffer} buffer      - file contents
 * @param {string} contentType - MIME type
 * @returns {Promise<string>}  - the stored key
 */
async function putObject(key, buffer, contentType) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType
    })
  );
  return key;
}

/**
 * Retrieve an object from R2.
 * Pass the HTTP Range header value to support audio/video seeking.
 * @param {string}          key   - R2 object key
 * @param {string|undefined} range - value of the HTTP Range header, if present
 * @returns {Promise<import("@aws-sdk/client-s3").GetObjectCommandOutput>}
 */
async function getObject(key, range) {
  const params = { Bucket: bucket(), Key: key };
  if (range) params.Range = range;
  return await getClient().send(new GetObjectCommand(params));
}

/**
 * Delete an object from R2.
 * Reserved for future use (e.g. removing a release file on delete).
 * @param {string} key - R2 object key
 */
async function deleteObject(key) {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: key })
  );
}

module.exports = { buildKey, putObject, getObject, deleteObject };
