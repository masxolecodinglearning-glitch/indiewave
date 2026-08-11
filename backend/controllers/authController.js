const ApiError = require("../utils/apiError");
const env = require("../config/env");
const createSlug = require("../utils/slug");
const { signToken } = require("../utils/jwt");
const { hashPassword, comparePassword } = require("../utils/password");
const userModel = require("../models/userModel");

async function register(req, res, next) {
  try {
    const { name, email, password, stageName, country, genre, bio, role } = req.body;

    const existing = await userModel.findByEmail(email.toLowerCase());
    if (existing) {
      throw new ApiError(409, "Email is already in use");
    }

    const slugBase = createSlug(stageName || name);
    const slug = `${slugBase}-${Date.now().toString().slice(-6)}`;

    const wantsAdmin = role === "admin";
    const isAllowedAdmin = wantsAdmin && env.adminRegistrationKey && req.body.adminKey === env.adminRegistrationKey;

    const user = await userModel.createUser({
      name,
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      stageName,
      country,
      genre,
      bio,
      role: isAllowedAdmin ? "admin" : role || "artist",
      slug
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.status(201).json({ success: true, token, user });
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await userModel.findByEmail(email.toLowerCase());
    if (!user) {
      throw new ApiError(401, "Invalid credentials");
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      throw new ApiError(401, "Invalid credentials");
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    const safeUser = await userModel.findById(user.id);

    res.json({ success: true, token, user: safeUser });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const user = await userModel.findById(req.user.id);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  me
};