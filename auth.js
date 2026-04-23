/**
 * routes/admin.js — Admin Dashboard Routes
 * All routes require: protect + isAdmin middleware
 */
const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const Research = require('../models/Research');
const Patent   = require('../models/Patent');
const Comment  = require('../models/Comment');
const { protect } = require('../middleware/auth');
const { isAdmin } = require('../middleware/admin');

// Apply auth to all admin routes
router.use(protect, isAdmin);

// ── @GET /api/admin/dashboard ─────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers, activeUsers, bannedUsers,
      totalResearch, pendingResearch, acceptedResearch, rejectedResearch,
      totalPatents, pendingPatents, publishedPatents,
      totalComments
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true, isBanned: false }),
      User.countDocuments({ isBanned: true }),
      Research.countDocuments({ isActive: true }),
      Research.countDocuments({ status: { $in: ['submitted','screening','under_review'] }, isActive: true }),
      Research.countDocuments({ status: 'accepted', isActive: true }),
      Research.countDocuments({ status: 'rejected', isActive: true }),
      Patent.countDocuments({ isActive: true }),
      Patent.countDocuments({ status: { $in: ['submitted','verification'] }, isActive: true }),
      Patent.countDocuments({ status: { $in: ['published','granted'] }, isActive: true }),
      Comment.countDocuments({ isActive: true })
    ]);

    // Recent signups (last 7 days)
    const recentUsers = await User.find({ createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } })
      .select('fullName email role institution createdAt')
      .sort({ createdAt: -1 }).limit(10);

    // Recent submissions
    const recentSubmissions = await Research.find({ status: 'submitted' })
      .populate('author', 'fullName institution')
      .select('title department createdAt status')
      .sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      stats: {
        users: { total: totalUsers, active: activeUsers, banned: bannedUsers },
        research: { total: totalResearch, pending: pendingResearch, accepted: acceptedResearch, rejected: rejectedResearch },
        patents: { total: totalPatents, pending: pendingPatents, published: publishedPatents },
        comments: { total: totalComments }
      },
      recentUsers,
      recentSubmissions
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching dashboard.' });
  }
});

// ── @GET /api/admin/research/pending ─────────────────────
router.get('/research/pending', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const papers = await Research.find({ status: { $in: ['submitted','screening','under_review'] }, isActive: true })
      .populate('author', 'fullName email institution')
      .sort({ createdAt: 1 })
      .skip(skip).limit(Number(limit));
    const total = await Research.countDocuments({ status: { $in: ['submitted','screening','under_review'] }, isActive: true });
    res.json({ success: true, papers, total });
  } catch {
    res.status(500).json({ message: 'Error.' });
  }
});

// ── @PATCH /api/admin/research/:id/review ────────────────
router.patch('/research/:id/review', async (req, res) => {
  try {
    const { status, reviewNotes } = req.body;
    const validStatuses = ['screening','under_review','accepted','rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
    }
    const paper = await Research.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewNotes:  reviewNotes || '',
        reviewedBy:   req.user._id,
        ...(status === 'accepted' && { publishedAt: new Date() })
      },
      { new: true }
    ).populate('author', 'fullName email');

    if (!paper) return res.status(404).json({ message: 'Paper not found.' });

    // Notify author
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${paper.author._id}`).emit('paper_reviewed', { title: paper.title, status });
    }

    res.json({ success: true, paper, message: `Paper status updated to "${status}"` });
  } catch {
    res.status(500).json({ message: 'Error reviewing paper.' });
  }
});

// ── @GET /api/admin/patents/pending ──────────────────────
router.get('/patents/pending', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const patents = await Patent.find({ status: { $in: ['submitted','verification'] }, isActive: true })
      .populate('inventor', 'fullName email institution')
      .sort({ createdAt: 1 })
      .skip(skip).limit(Number(limit));
    const total = await Patent.countDocuments({ status: { $in: ['submitted','verification'] }, isActive: true });
    res.json({ success: true, patents, total });
  } catch {
    res.status(500).json({ message: 'Error.' });
  }
});

// ── @PATCH /api/admin/patents/:id/review ─────────────────
router.patch('/patents/:id/review', async (req, res) => {
  try {
    const { status, reviewNotes } = req.body;
    const valid = ['verification','published','granted','rejected'];
    if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status.' });

    const patent = await Patent.findByIdAndUpdate(
      req.params.id,
      { status, reviewNotes: reviewNotes || '', reviewedBy: req.user._id, ...(status === 'published' && { publishedAt: new Date() }) },
      { new: true }
    ).populate('inventor', 'fullName email');

    if (!patent) return res.status(404).json({ message: 'Patent not found.' });
    res.json({ success: true, patent });
  } catch {
    res.status(500).json({ message: 'Error reviewing patent.' });
  }
});

// ── @GET /api/admin/users ─────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip  = (page - 1) * limit;
    const query = {};
    if (search) query.$or = [{ fullName: new RegExp(search,'i') }, { email: new RegExp(search,'i') }];

    const users = await User.find(query)
      .select('fullName email role institution isActive isBanned isAdmin createdAt lastLogin')
      .sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await User.countDocuments(query);
    res.json({ success: true, users, total });
  } catch {
    res.status(500).json({ message: 'Error fetching users.' });
  }
});

// ── @PATCH /api/admin/users/:id/ban ──────────────────────
router.patch('/users/:id/ban', async (req, res) => {
  try {
    const { isBanned, banReason } = req.body;
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot ban yourself.' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id, { isBanned: !!isBanned, banReason: banReason || '' }, { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ success: true, user, message: isBanned ? 'User banned.' : 'User unbanned.' });
  } catch {
    res.status(500).json({ message: 'Error.' });
  }
});

// ── @DELETE /api/admin/users/:id ──────────────────────────
router.delete('/users/:id', async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete yourself.' });
    }
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'User deactivated.' });
  } catch {
    res.status(500).json({ message: 'Error.' });
  }
});

// ── @POST /api/admin/announce ─────────────────────────────
router.post('/announce', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required.' });
    const io = req.app.get('io');
    if (io) io.emit('announcement', { message, from: 'MANI Admin', timestamp: new Date() });
    res.json({ success: true, message: 'Announcement sent to all connected users.' });
  } catch {
    res.status(500).json({ message: 'Error sending announcement.' });
  }
});

module.exports = router;
