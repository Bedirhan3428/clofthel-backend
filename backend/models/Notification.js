const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true,
  },
  anime: {
    type: mongoose.Schema.ObjectId,
    ref: 'Anime',
    required: true,
  },
  type: {
    type: String,
    enum: ['NEW_EPISODE', 'SYSTEM'],
    default: 'NEW_EPISODE',
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  linkData: {
    type: mongoose.Schema.Types.Mixed, // e.g. { episode: 1 } or just pass it in anime ref
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Otomatik silinme (TTL Index) - 30 gün sonra bildirimler silinsin
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', NotificationSchema);
