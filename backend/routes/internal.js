const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
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

/**
 * POST /api/internal/bulk-episode-sync
 * Termux scraper'dan çağrılır. Telefon tranimeizle.io'dan sayfaları çekip
 * parse edilen bölüm listesini bu endpoint'e gönderir.
 * Body: { episodes: [{ slug, episode, url }] }
 */
router.post('/bulk-episode-sync', apiKeyAuth, async (req, res) => {
  try {
    const { episodes } = req.body;
    
    if (!episodes || !Array.isArray(episodes)) {
      return res.status(400).json({ success: false, message: 'Missing episodes array' });
    }

    let newAnime = 0;
    let newEpisodes = 0;
    let skipped = 0;

    for (const ep of episodes) {
      if (!ep.slug || !ep.episode || !ep.url) {
        skipped++;
        continue;
      }

      let anime = await Anime.findOne({ tranimeizle_slug: ep.slug });

      if (anime) {
        const episodes_map = anime.episodes || {};
        if (!episodes_map[ep.episode]) {
          episodes_map[ep.episode] = ep.url;
          anime.episodes = episodes_map;
          anime.total_episodes = Math.max(anime.total_episodes || 0, ep.episode);
          anime.markModified('episodes');
          await anime.save();
          newEpisodes++;

          // Bildirim gönder
          try {
            await sendNewEpisodeNotifications(anime._id, {
              bolum_no: ep.episode,
              bolum_adi: `${ep.episode}. Bölüm`
            });
          } catch (notifErr) {
            console.warn(`[BULK-SYNC] Notification failed for ${ep.slug} ep${ep.episode}:`, notifErr.message);
          }
        } else {
          skipped++;
        }
      } else {
        const newEpisodes_map = {};
        newEpisodes_map[ep.episode] = ep.url;
        
        anime = new Anime({
          tranimeizle_slug: ep.slug,
          tranimeizle_url: `https://www.tranimeizle.io/${ep.slug}`,
          total_episodes: ep.episode,
          episodes: newEpisodes_map
        });
        await anime.save();
        newAnime++;
        newEpisodes++;
      }
    }

    console.log(`[BULK-SYNC] Done: ${newAnime} new anime, ${newEpisodes} new episodes, ${skipped} skipped`);
    res.json({ success: true, newAnime, newEpisodes, skipped, total: episodes.length });
  } catch (error) {
    console.error('[BULK-SYNC] Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

module.exports = router;

