const express = require('express');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/notifications -> Get user notifications
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('anime', 'title _id coverImage comparable_base_slug');

    const unreadCount = await Notification.countDocuments({ user: req.user._id, isRead: false });

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Bildirimler getirilirken hata:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// PUT /api/notifications/:id/read -> Mark single notification as read
router.put('/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Bildirim bulunamadı' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error('Bildirim güncellenirken hata:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

// PUT /api/notifications/read-all -> Mark all as read
router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({ success: true, message: 'Tüm bildirimler okundu olarak işaretlendi' });
  } catch (error) {
    console.error('Bildirimler güncellenirken hata:', error);
    res.status(500).json({ success: false, message: 'Sunucu hatası' });
  }
});

module.exports = router;
