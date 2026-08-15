const express = require('express');
const router = express.Router();
const FansubOffset = require('../models/FansubOffset');

/**
 * GET /api/v1/fansub-offsets
 * Returns current version and offsets map from database
 */
router.get('/', async (req, res) => {
  try {
    let config = await FansubOffset.findOne().sort({ version: -1 });
    
    if (!config) {
      config = await FansubOffset.create({
        version: 1,
        offsets: {
          'TRanimeizle': 0,
          'FGL Çeviri': 0,
          'Seicode': 10,
          'TAÇE': 8,
          'Anisekai': 7,
          'Puzzle': 0,
          'Tempura': 12,
          'Aoi Fansub': 5,
          'Animeou': 6,
          'Sukebe': 0,
          'Adonis': 0,
          'default': 0
        }
      });
    }

    res.json({
      success: true,
      version: config.version,
      offsets: Object.fromEntries(config.offsets || new Map())
    });
  } catch (err) {
    console.error('[GET /api/v1/fansub-offsets] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/fansub-offsets/update
 * Updates fansub offsets and increments version number
 */
router.post('/update', async (req, res) => {
  try {
    const { offsets } = req.body;
    if (!offsets || typeof offsets !== 'object') {
      return res.status(400).json({ success: false, error: 'Offsets objesi gerekli.' });
    }

    let config = await FansubOffset.findOne().sort({ version: -1 });
    const nextVersion = (config?.version || 0) + 1;

    const newConfig = await FansubOffset.create({
      version: nextVersion,
      offsets: new Map(Object.entries(offsets)),
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Fansub intro ofsetleri başarıyla güncellendi.',
      version: newConfig.version,
      offsets: Object.fromEntries(newConfig.offsets)
    });
  } catch (err) {
    console.error('[POST /api/v1/fansub-offsets/update] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
