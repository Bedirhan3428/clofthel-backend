const express = require('express');
const router = express.Router();
const { sendNewEpisodeNotifications } = require('../utils/notificationHelper');
const { apiKeyAuth } = require('../middleware/authMiddleware');

/**
 * POST /api/internal/notify-new-episode
 * Scraper servisinden çağrılır. Yeni bir bölüm bulunduğunda bildirim atılmasını sağlar.
 */
router.post('/notify-new-episode', apiKeyAuth, async (req, res) => {
  try {
    const { animeId, episodeData } = req.body;
    
    if (!animeId || !episodeData) {
      return res.status(400).json({ success: false, message: 'Missing animeId or episodeData' });
    }

    // Call the existing notification helper
    await sendNewEpisodeNotifications(animeId, episodeData);

    res.status(200).json({ success: true, message: 'Notification triggered successfully' });
  } catch (error) {
    console.error('Internal API notify error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
