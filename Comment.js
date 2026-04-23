/**
 * models/User.js — MANI User Schema
 */
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  // Core identity
  fullName:    { type: String, required: true, trim: true, maxlength: 100 },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, minlength: 8 },   // null for OAuth users
  googleId:    { type: String, sparse: true },
  phoneNumber: { type: String, sparse: true },
  firebaseUid: { type: String, sparse: true },

  // Profile
  avatar:      { type: String, default: '' },
  banner:      { type: String, default: '' },
  bio:         { type: String, maxlength: 500, default: '' },
  institution: { type: String, default: '' },
  department:  { type: String, default: '' },
  skills:      [{ type: String }],
  website:     { type: String, default: '' },
  linkedIn:    { type: String, default: '' },
  location:    { type: String, default: '' },

  // Role & permissions
  role: {
    type: String,
    enum: ['student','researcher','professor','inventor','startup','institution','admin','other'],
    default: 'researcher'
  },
  isAdmin:         { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  emailVerifyToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  isActive:    { type: Boolean, default: true },
  isBanned:    { type: Boolean, default: false },
  banReason:   { type: String, default: '' },

  // Social
  followers:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedItems:  [{
    itemType: { type: String, enum: ['research','patent'] },
    itemId:   mongoose.Schema.Types.ObjectId
  }],

  // Timestamps
  lastLogin:   { type: Date },
}, { timestamps: true });

// ── Hash password before save ──────────────────────────────
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) { next(err); }
});

// ── Compare passwords ──────────────────────────────────────
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Virtual: follower/following counts ────────────────────
UserSchema.virtual('followerCount').get(function() {
  return this.followers.length;
});
UserSchema.virtual('followingCount').get(function() {
  return this.following.length;
});

// ── Strip password from JSON output ───────────────────────
UserSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.emailVerifyToken;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
