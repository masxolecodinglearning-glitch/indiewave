const slugify = require("slugify");

function createSlug(text) {
  return slugify(text, { lower: true, strict: true, trim: true });
}

module.exports = createSlug;