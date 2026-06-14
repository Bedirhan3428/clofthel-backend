const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    targetId: {
      type: String,
      required: true,
      index: true,
    },
    authorName: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    authorKey: {
      type: String,
      required: true,
    },
    ip: {
      type: String,
      required: true,
      index: true,
    },
    likeCount: {
      type: Number,
      default: 0,
    },
    likes: {
      type: [String],
      default: [],
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // creates createdAt and updatedAt automatically
    collection: 'comments',
    versionKey: false,
  }
);

module.exports = mongoose.model('Comment', commentSchema);
