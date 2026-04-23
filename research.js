/**
 * routes/social.js — Comments, Messages, Notifications
 * POST /api/social/comments            — add comment
 * GET  /api/social/comments/:postType/:postId — get comments
 * POST /api/social/comments/:id/like   — like comment
 * DELETE /api/social/comments/:id      — delete comment
 */
const express  = require('express');
const router   = express.Router();
const Comment  = require('../models/Comment');
const { protect } = require('../middleware/auth');

// ── @POST /api/social/comments ────────────────────────────
router.post('/comments', protect, async (req, res) => {
  try {
    const { postType, postId, content, parentComment } = req.body;

    if (!postType || !postId || !content?.trim()) {
      return res.status(400).json({ message: 'postType, postId, and content are required.' });
    }
    if (!['research','patent'].includes(postType)) {
      return res.status(400).json({ message: 'postType must be "research" or "patent".' });
    }

    const comment = await Comment.create({
      author: req.user._id,
      postType,
      postId,
      content: content.trim(),
      parentComment: parentComment || null
    });

    // If reply, add to parent's replies array
    if (parentComment) {
      await Comment.findByIdAndUpdate(parentComment, { $push: { replies: comment._id } });
    }

    await comment.populate('author', 'fullName avatar institution');

    // Realtime broadcast
    const io = req.app.get('io');
    if (io) {
      io.to(`post_${postId}`).emit('new_comment', { comment });
    }

    res.status(201).json({ success: true, comment });
  } catch (err) {
    res.status(500).json({ message: 'Error posting comment.' });
  }
});

// ── @GET /api/social/comments/:postType/:postId ───────────
router.get('/comments/:postType/:postId', async (req, res) => {
  try {
    const { postType, postId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const comments = await Comment.find({ postId, postType, isActive: true, parentComment: null })
      .populate('author', 'fullName avatar institution')
      .populate({
        path: 'replies',
        match: { isActive: true },
        populate: { path: 'author', select: 'fullName avatar institution' }
      })
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit));

    const total = await Comment.countDocuments({ postId, postType, isActive: true, parentComment: null });
    res.json({ success: true, comments, total });
  } catch {
    res.status(500).json({ message: 'Error fetching comments.' });
  }
});

// ── @POST /api/social/comments/:id/like ──────────────────
router.post('/comments/:id/like', protect, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found.' });
    const liked = comment.likes.includes(req.user._id);
    if (liked) comment.likes.pull(req.user._id);
    else comment.likes.push(req.user._id);
    await comment.save();
    res.json({ success: true, liked: !liked, likeCount: comment.likes.length });
  } catch {
    res.status(500).json({ message: 'Error liking comment.' });
  }
});

// ── @DELETE /api/social/comments/:id ─────────────────────
router.delete('/comments/:id', protect, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found.' });
    if (comment.author.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Not authorized.' });
    }
    comment.isActive = false;
    await comment.save();
    res.json({ success: true, message: 'Comment removed.' });
  } catch {
    res.status(500).json({ message: 'Error deleting comment.' });
  }
});

module.exports = router;
