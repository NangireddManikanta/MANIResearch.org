/**
 * models/Research.js — Research Paper Schema
 */
const mongoose = require('mongoose');

const ResearchSchema = new mongoose.Schema({
  // Author
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  coAuthors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  authorsList: [{ name: String, institution: String, email: String }], // for non-registered co-authors

  // Paper details
  title:       { type: String, required: true, trim: true, maxlength: 300 },
  abstract:    { type: String, required: true, maxlength: 5000 },
  keywords:    [{ type: String, lowercase: true, trim: true }],
  department:  {
    type: String,
    enum: ['aerospace','mechanical','civil','electrical','ai','computer_science','biotechnology','medical','physics','chemistry','mathematics','space_research','other'],
    required: true
  },
  institution: { type: String, default: '' },
  references:  [{ type: String }],

  // Files
  document: {
    url:      String,
    filename: String,
    size:     Number,
    format:   { type: String, enum: ['pdf','doc','docx'] }
  },
  coverImage: { type: String, default: '' },

  // Classification
  accessType: { type: String, enum: ['open','restricted'], default: 'open' },
  license:    { type: String, default: 'CC BY 4.0' },
  hashtags:   [{ type: String }],

  // Workflow status
  status: {
    type: String,
    enum: ['draft','submitted','screening','under_review','accepted','rejected'],
    default: 'draft'
  },
  reviewNotes:  { type: String, default: '' },
  reviewedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  publishedAt:  { type: Date },

  // Social metrics (real — start at 0)
  views:    { type: Number, default: 0 },
  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  saves:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  shares:   { type: Number, default: 0 },

  // Flags
  isFeatured: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: true },
  reportCount: { type: Number, default: 0 },
  reports: [{
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason:   String,
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Full-text search index
ResearchSchema.index({ title: 'text', abstract: 'text', keywords: 'text' });
ResearchSchema.index({ department: 1, status: 1 });
ResearchSchema.index({ author: 1, createdAt: -1 });

// Virtual: like count
ResearchSchema.virtual('likeCount').get(function() { return this.likes.length; });
ResearchSchema.virtual('saveCount').get(function() { return this.saves.length; });

module.exports = mongoose.model('Research', ResearchSchema);
