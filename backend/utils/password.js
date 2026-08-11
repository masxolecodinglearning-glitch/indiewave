const bcrypt = require("bcrypt");

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

module.exports = { hashPassword, comparePassword };