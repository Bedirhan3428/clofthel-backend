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
 * Body: { episodes: [{ slug, episode, url, title }] }
 */
router.post('/bulk-episode-sync', apiKeyAuth, async (req, res) => {
  try {
    const { episodes } = req.body;
    
    if (!episodes || !Array.isArray(episodes)) {
      return res.status(400).json({ success: false, message: 'Missing episodes array' });
    }

    let newAnimeCount = 0;
    let newEpisodesCount = 0;
    let updatedEpisodesCount = 0;
    let skipped = 0;

    for (const ep of episodes) {
      if (!ep.slug || !ep.episode || !ep.url) {
        skipped++;
        continue;
      }

      const cleanSlug = ep.slug.replace(/^https?:\/\/[^\/]+\/(?:anime\/)?/i, '').replace(/^anime\//i, '').replace(/-izle$/i, '').trim();
      const slugWithIzle = `${cleanSlug}-izle`;
      const slugWithoutIzle = cleanSlug;

      let anime = await Anime.findOne({
        $or: [
          { tranimeizle_slug: cleanSlug },
          { tranimeizle_slug: slugWithIzle },
          { tranimeizle_slug: slugWithoutIzle }
        ]
      });

      if (anime) {
        const episodesMap = anime.episodes || {};
        const epKey = String(ep.episode);

        if (!episodesMap[epKey] || episodesMap[epKey] !== ep.url) {
          const isNew = !episodesMap[epKey];
          episodesMap[epKey] = ep.url;
          anime.episodes = episodesMap;
          anime.total_episodes = Math.max(anime.total_episodes || 0, ep.episode, Object.keys(episodesMap).length);
          anime.markModified('episodes');
          await anime.save();

          if (isNew) {
            newEpisodesCount++;
            // Send push notification to users favoriting/listing this anime
            try {
              sendNewEpisodeNotifications(anime._id, {
                bolum_no: ep.episode,
                bolum_adi: ep.title || `${ep.episode}. Bölüm`
              }).catch(() => {});
            } catch (notifErr) {
              console.warn(`[BULK-SYNC] Notification warning for ${cleanSlug} ep${ep.episode}:`, notifErr.message);
            }
          } else {
            updatedEpisodesCount++;
          }
        } else {
          skipped++;
        }
      } else {
        // Create new anime in DB
        const newEpisodesMap = {};
        newEpisodesMap[String(ep.episode)] = ep.url;
        
        const formattedTitle = cleanSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        anime = new Anime({
          tranimeizle_slug: slugWithIzle,
          tranimeizle_url: `https://www.tranimeizle.io/anime/${cleanSlug}-izle`,
          orijinal_ad: formattedTitle,
          total_episodes: ep.episode,
          episodes: newEpisodesMap,
          format: 'TV'
        });

        await anime.save();
        newAnimeCount++;
        newEpisodesCount++;
      }
    }

    // Refresh Orchestrator memory cache so updates are instantly live
    try {
      const animesRouter = require('./animes');
      if (typeof animesRouter.loadOrchestratorMap === 'function') {
        await animesRouter.loadOrchestratorMap();
      }
    } catch (e) {}

    console.log(`[BULK-SYNC] Processed ${episodes.length} items: ${newAnimeCount} new anime, ${newEpisodesCount} new ep, ${updatedEpisodesCount} updated ep, ${skipped} skipped.`);
    res.json({
      success: true,
      newAnime: newAnimeCount,
      newEpisodes: newEpisodesCount,
      updatedEpisodes: updatedEpisodesCount,
      skipped,
      total: episodes.length
    });
  } catch (error) {
    console.error('[BULK-SYNC] Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/internal/orchestrator/ingest
 * Primary endpoint for Orchestrator Service ingestion events.
 */
router.post('/orchestrator/ingest', apiKeyAuth, async (req, res) => {
  try {
    const { data, source, timestamp } = req.body;
    console.log(`[ORCHESTRATOR-INGEST] Event received from ${source || 'unknown'} at ${timestamp || new Date().toISOString()}`);

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing data array' });
    }

    res.status(200).json({
      success: true,
      message: 'Orchestrator event ingested successfully',
      count: data.length
    });
  } catch (error) {
    console.error('[ORCHESTRATOR-INGEST] Error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/internal/reload-orchestrator
 * Trigger immediate reload of orchestrator state cache into backend RAM memory.
 */
router.post('/reload-orchestrator', apiKeyAuth, async (req, res) => {
  try {
    const animesRouter = require('./animes');
    if (typeof animesRouter.loadOrchestratorMap === 'function') {
      await animesRouter.loadOrchestratorMap();
    }
    console.log('✅ [INTERNAL] Orchestrator cache reloaded successfully into memory.');
    res.json({ success: true, message: 'Orchestrator cache successfully reloaded into memory.' });
  } catch (error) {
    console.error('❌ [INTERNAL] Reload error:', error);
    res.status(500).json({ success: false, message: 'Failed to reload orchestrator cache.', error: error.message });
  }
});

/**
 * POST /api/internal/debug-log
 * Receives touch coordinates and bot protection debug diagnostics from mobile app and saves to MongoDB.
 */
router.post('/debug-log', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const logData = req.body || {};
    
    if (db) {
      await db.collection('debug_logs').insertOne({
        ...logData,
        createdAt: new Date()
      });
      console.log(`📍 [DEBUG-LOG] Click/Captcha report saved to MongoDB: Action: ${logData.action || 'click'} | X:${logData.x} Y:${logData.y}`);
    }
    
    res.json({ success: true, message: 'Debug log recorded in MongoDB.' });
  } catch (error) {
    console.error('❌ [DEBUG-LOG] Error saving report:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;


