/**
 * routes/users.js — User Profile & Social Routes
 * GET    /api/users/:id           — get user profile
 * PUT    /api/users/profile       — update my profile
 * POST   /api/users/:id/follow    — follow/unfollow
 * GET    /api/users/search        — search users
 * GET    /api/users/:id/research  — user's research papers
 * GET    /api/users/:id/patents   — user's patents
 */
const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const Research = require('../models/Research');
const Patent   = require('../models/Patent');
const { protect } = require('../middleware/auth');

// ── @GET /api/users/search?q= ─────────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { q = '', page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const query = q
      ? { isActive: true, $or: [
          { fullName: new RegExp(q, 'i') },
          { institution: new RegExp(q, 'i') },
          { skills: { $in: [new RegExp(q, 'i')] } }
        ]}
      : { isActive: true };

    const users = await User.find(query)
      .select('fullName avatar institution role followers')
      .skip(skip).limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await User.countDocuments(query);

    res.json({ success: true, users, total, page: Number(page) });
  } catch (err) {
    res.status(500).json({ message: 'Error searching users.' });
  }
});

// ── @GET /api/users/:id ───────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -emailVerifyToken -passwordResetToken -passwordResetExpires')
      .populate('followers', 'fullName avatar')
      .populate('following', 'fullName avatar');

    if (!user || !user.isActive) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Counts
    const researchCount = await Research.countDocuments({ author: user._id, status: 'accepted' });
    const patentCount   = await Patent.countDocuments({ inventor: user._id, status: 'published' });

    res.json({ success: true, user, researchCount, patentCount });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user profile.' });
  }
});

// ── @PUT /api/users/profile ───────────────────────────────
router.put('/profile', protect, async (req, res) => {
  try {
    const allowedFields = ['fullName','bio','institution','department','skills','website','linkedIn','location','avatar','banner'];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // Sanitize
    if (updates.bio && updates.bio.length > 500) {
      return res.status(400).json({ message: 'Bio cannot exceed 500 characters.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id, { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ success: true, user, message: 'Profile updated successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile.' });
  }
});

// ── @POST /api/users/:id/follow ───────────────────────────
router.post('/:id/follow', protect, async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot follow yourself.' });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser || !targetUser.isActive) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isFollowing = targetUser.followers.includes(req.user._id);

    if (isFollowing) {
      // Unfollow
      await User.findByIdAndUpdate(req.params.id,  { $pull: { followers: req.user._id } });
      await User.findByIdAndUpdate(req.user._id, { $pull: { following: req.params.id } });
      return res.json({ success: true, followed: false, message: `Unfollowed ${targetUser.fullName}` });
    } else {
      // Follow
      await User.findByIdAndUpdate(req.params.id,  { $addToSet: { followers: req.user._id } });
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { following: req.params.id } });

      // Realtime notification (Socket.io)
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${req.params.id}`).emit('new_follower', {
          from: { _id: req.user._id, fullName: req.user.fullName, avatar: req.user.avatar }
        });
      }

      return res.json({ success: true, followed: true, message: `Following ${targetUser.fullName}` });
    }
  } catch (err) {
    res.status(500).json({ message: 'Error processing follow request.' });
  }
});

// ── @GET /api/users/:id/research ──────────────────────────
router.get('/:id/research', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const papers = await Research.find({ author: req.params.id, status: 'accepted', isActive: true })
      .select('title abstract department status views likes createdAt')
      .sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Research.countDocuments({ author: req.params.id, status: 'accepted', isActive: true });
    res.json({ success: true, papers, total });
  } catch {
    res.status(500).json({ message: 'Error fetching research papers.' });
  }
});

// ── @GET /api/users/:id/patents ───────────────────────────
router.get('/:id/patents', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const patents = await Patent.find({ inventor: req.params.id, status: 'published', isActive: true })
      .select('title category status views likes createdAt')
      .sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Patent.countDocuments({ inventor: req.params.id, status: 'published', isActive: true });
    res.json({ success: true, patents, total });
  } catch {
    res.status(500).json({ message: 'Error fetching patents.' });
  }
});

module.exports = router;
