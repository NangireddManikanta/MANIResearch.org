/**
 * models/Comment.js — Comment with nested replies
 */
const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  author:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  postType: { type: String, enum: ['research','patent'], required: true },
  postId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  content:  { type: String, required: true, trim: true, maxlength: 2000 },
  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  replies:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

CommentSchema.index({ postId: 1, postType: 1 });

module.exports = mongoose.model('Comment', CommentSchema);
