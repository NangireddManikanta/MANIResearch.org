/**
 * routes/auth.js — Authentication Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password/:token
 * GET  /api/auth/google
 * GET  /api/auth/google/callback
 * GET  /api/auth/me
 */
const express   = require('express');
const router    = express.Router();
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const passport  = require('passport');
const User      = require('../models/User');
const { protect } = require('../middleware/auth');

// ── Helper: generate JWT ──────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// ── Helper: set token cookie ──────────────────────────────
const sendTokenCookie = (res, token) => {
  res.cookie('mani_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
};

// ── @POST /api/auth/register ──────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password, role, institution } = req.body;

    // Validation
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    // Check duplicate
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    // Create user (password hashed via pre-save hook)
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role || 'researcher',
      institution: institution || ''
    });

    const token = generateToken(user._id);
    sendTokenCookie(res, token);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        institution: user.institution,
        avatar: user.avatar,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// ── @POST /api/auth/login ─────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (user.isBanned) {
      return res.status(403).json({ message: `Account banned: ${user.banReason}` });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);
    sendTokenCookie(res, token);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        institution: user.institution,
        avatar: user.avatar,
        isAdmin: user.isAdmin
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ── @POST /api/auth/logout ────────────────────────────────
router.post('/logout', protect, (req, res) => {
  res.clearCookie('mani_token');
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ── @POST /api/auth/forgot-password ──────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Security: don't reveal if email exists or not
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken   = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    await user.save();

    // TODO: Send email via Nodemailer
    // const resetURL = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
    // await sendPasswordResetEmail(user.email, resetURL);

    console.log(`[DEV] Password reset token for ${user.email}: ${resetToken}`);

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Error processing reset request.' });
  }
});

// ── @POST /api/auth/reset-password/:token ────────────────
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken:   hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token.' });
    }

    user.password             = password;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    const token = generateToken(user._id);
    sendTokenCookie(res, token);

    res.json({ success: true, message: 'Password reset successful.', token });
  } catch (err) {
    res.status(500).json({ message: 'Error resetting password.' });
  }
});

// ── @GET /api/auth/google ─────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// ── @GET /api/auth/google/callback ───────────────────────
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.CLIENT_URL}/login?error=google_auth_failed` }),
  (req, res) => {
    const token = generateToken(req.user._id);
    sendTokenCookie(res, token);
    res.redirect(`${process.env.CLIENT_URL}/?auth=success&token=${token}`);
  }
);

// ── @GET /api/auth/me ─────────────────────────────────────
router.get('/me', protect, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
