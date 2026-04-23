/**
 * routes/research.js — Research Paper Routes
 * GET    /api/research              — list accepted papers (public feed)
 * GET    /api/research/:id          — single paper
 * POST   /api/research              — create (auth required)
 * PUT    /api/research/:id          — update own paper
 * POST   /api/research/:id/submit   — submit for review
 * DELETE /api/research/:id          — soft delete
 * POST   /api/research/:id/like     — like/unlike
 * POST   /api/research/:id/save     — save/unsave
 * POST   /api/research/:id/view     — increment view
 * GET    /api/research/search       — search papers
 * GET    /api/research/trending     — trending (most liked)
 */
const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const cloudinary = require('../config/cloudinary');
const Research  = require('../models/Research');
const Comment   = require('../models/Comment');
const { protect, optionalAuth } = require('../middleware/auth');

// ── Multer for file upload (memory storage → Cloudinary) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX files are allowed.'));
  }
});

// ── @GET /api/research/trending ──────────────────────────
router.get('/trending', async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const papers = await Research.find({ status: 'accepted', isActive: true })
      .select('title department views likes createdAt')
      .sort({ views: -1, 'likes': -1, createdAt: -1 })
      .limit(Number(limit))
      .populate('author', 'fullName avatar institution');
    res.json({ success: true, papers });
  } catch {
    res.status(500).json({ message: 'Error fetching trending papers.' });
  }
});

// ── @GET /api/research/search?q= ─────────────────────────
router.get('/search', async (req, res) => {
  try {
    const { q = '', department, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const query = { status: 'accepted', isActive: true };
    if (q) query.$text = { $search: q };
    if (department) query.department = department;

    const papers = await Research.find(query)
      .select('title abstract department views likes createdAt author')
      .populate('author', 'fullName avatar institution')
      .sort(q ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .skip(skip).limit(Number(limit));

    const total = await Research.countDocuments(query);
    res.json({ success: true, papers, total, page: Number(page) });
  } catch {
    res.status(500).json({ message: 'Error searching papers.' });
  }
});

// ── @GET /api/research ────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, department, type = 'feed' } = req.query;
    const skip = (page - 1) * limit;
    const query = { status: 'accepted', isActive: true };
    if (department) query.department = department;

    const papers = await Research.find(query)
      .select('title abstract department views likes saves coverImage hashtags createdAt')
      .populate('author', 'fullName avatar institution role')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit));

    const total = await Research.countDocuments(query);
    res.json({ success: true, papers, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching research papers.' });
  }
});

// ── @GET /api/research/:id ────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const paper = await Research.findById(req.params.id)
      .populate('author', 'fullName avatar institution role bio followers')
      .populate('coAuthors', 'fullName avatar institution');

    if (!paper || !paper.isActive) {
      return res.status(404).json({ message: 'Research paper not found.' });
    }

    const comments = await Comment.find({ postId: paper._id, postType: 'research', isActive: true, parentComment: null })
      .populate('author', 'fullName avatar')
      .populate({ path: 'replies', populate: { path: 'author', select: 'fullName avatar' } })
      .sort({ createdAt: -1 });

    res.json({ success: true, paper, comments });
  } catch {
    res.status(500).json({ message: 'Error fetching paper.' });
  }
});

// ── @POST /api/research ───────────────────────────────────
router.post('/', protect, upload.single('document'), async (req, res) => {
  try {
    const { title, abstract, keywords, department, institution, authorsList, references, hashtags, accessType } = req.body;

    if (!title || !abstract || !department) {
      return res.status(400).json({ message: 'Title, abstract, and department are required.' });
    }

    let documentData = {};
    if (req.file) {
      // Upload to Cloudinary
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { resource_type: 'raw', folder: 'mani/research', format: req.file.mimetype.split('/')[1] },
          (err, result) => err ? reject(err) : resolve(result)
        ).end(req.file.buffer);
      });
      documentData = {
        url:      result.secure_url,
        filename: req.file.originalname,
        size:     req.file.size,
        format:   req.file.originalname.split('.').pop()
      };
    }

    const paper = await Research.create({
      author:      req.user._id,
      title:       title.trim(),
      abstract:    abstract.trim(),
      keywords:    keywords ? keywords.split(',').map(k => k.trim().toLowerCase()) : [],
      department,
      institution: institution || req.user.institution,
      authorsList: authorsList ? JSON.parse(authorsList) : [],
      references:  references ? JSON.parse(references) : [],
      hashtags:    hashtags ? hashtags.split(',').map(h => h.trim()) : [],
      accessType:  accessType || 'open',
      document:    documentData,
      status:      'draft'
    });

    res.status(201).json({ success: true, paper, message: 'Research paper saved as draft.' });
  } catch (err) {
    console.error('Create research error:', err);
    res.status(500).json({ message: err.message || 'Error creating research paper.' });
  }
});

// ── @PUT /api/research/:id ────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const paper = await Research.findById(req.params.id);
    if (!paper) return res.status(404).json({ message: 'Paper not found.' });
    if (paper.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to edit this paper.' });
    }
    if (['accepted','rejected'].includes(paper.status)) {
      return res.status(400).json({ message: 'Published papers cannot be edited.' });
    }

    const allowed = ['title','abstract','keywords','department','institution','references','hashtags','accessType','coverImage'];
    allowed.forEach(field => { if (req.body[field] !== undefined) paper[field] = req.body[field]; });
    await paper.save();

    res.json({ success: true, paper, message: 'Paper updated successfully.' });
  } catch {
    res.status(500).json({ message: 'Error updating paper.' });
  }
});

// ── @POST /api/research/:id/submit ───────────────────────
router.post('/:id/submit', protect, async (req, res) => {
  try {
    const paper = await Research.findById(req.params.id);
    if (!paper) return res.status(404).json({ message: 'Paper not found.' });
    if (paper.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized.' });
    }
    if (paper.status !== 'draft') {
      return res.status(400).json({ message: `Paper is already in "${paper.status}" status.` });
    }
    paper.status = 'submitted';
    await paper.save();

    res.json({ success: true, message: 'Paper submitted for review! You will be notified of the outcome.' });
  } catch {
    res.status(500).json({ message: 'Error submitting paper.' });
  }
});

// ── @DELETE /api/research/:id ─────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const paper = await Research.findById(req.params.id);
    if (!paper) return res.status(404).json({ message: 'Paper not found.' });
    if (paper.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized.' });
    }
    paper.isActive = false;
    await paper.save();
    res.json({ success: true, message: 'Paper removed.' });
  } catch {
    res.status(500).json({ message: 'Error removing paper.' });
  }
});

// ── @POST /api/research/:id/like ─────────────────────────
router.post('/:id/like', protect, async (req, res) => {
  try {
    const paper = await Research.findById(req.params.id);
    if (!paper) return res.status(404).json({ message: 'Paper not found.' });

    const alreadyLiked = paper.likes.includes(req.user._id);
    if (alreadyLiked) {
      paper.likes.pull(req.user._id);
    } else {
      paper.likes.push(req.user._id);
      // Notify author
      const io = req.app.get('io');
      if (io && paper.author.toString() !== req.user._id.toString()) {
        io.to(`user_${paper.author}`).emit('new_like', {
          type: 'research', title: paper.title,
          from: { fullName: req.user.fullName }
        });
      }
    }
    await paper.save();
    res.json({ success: true, liked: !alreadyLiked, likeCount: paper.likes.length });
  } catch {
    res.status(500).json({ message: 'Error processing like.' });
  }
});

// ── @POST /api/research/:id/save ─────────────────────────
router.post('/:id/save', protect, async (req, res) => {
  try {
    const paper = await Research.findById(req.params.id);
    if (!paper) return res.status(404).json({ message: 'Paper not found.' });
    const alreadySaved = paper.saves.includes(req.user._id);
    if (alreadySaved) paper.saves.pull(req.user._id);
    else paper.saves.push(req.user._id);
    await paper.save();
    res.json({ success: true, saved: !alreadySaved });
  } catch {
    res.status(500).json({ message: 'Error saving paper.' });
  }
});

// ── @POST /api/research/:id/view ─────────────────────────
router.post('/:id/view', async (req, res) => {
  try {
    await Research.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

module.exports = router;
