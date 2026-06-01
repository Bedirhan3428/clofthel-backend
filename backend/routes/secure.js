const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// Basit in-memory token store (production'da Redis kullanılmalı)
const tokenStore = new Map();

// Süresi dolmuş tokenları temizle (her 5 dakikada)
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenStore) {
    if (data.expiresAt < now) {
      tokenStore.delete(token);
    }
  }
}, 5 * 60 * 1000);

/**
 * POST /api/secure/generate-token
 * Video izleme için 2 dakikalık geçici token üretir.
 * Body: { anime_id, episode_number }
 */
router.post('/generate-token', (req, res) => {
  try {
    const { anime_id, episode_number } = req.body;

    if (!anime_id || !episode_number) {
      return res.status(400).json({
        success: false,
        error: 'anime_id ve episode_number gerekli.',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 2 * 60 * 1000; // 2 dakika

    tokenStore.set(token, {
      anime_id,
      episode_number,
      expiresAt,
      createdAt: Date.now(),
    });

    res.json({
      success: true,
      token,
      expiresAt,
      ttl: 120, // saniye
    });
  } catch (error) {
    console.error('[POST /api/secure/generate-token] Error:', error.message);
    res.status(500).json({ success: false, error: 'Token üretilemedi.' });
  }
});

/**
 * POST /api/secure/verify-token
 * Üretilen tokenın geçerliliğini kontrol eder.
 * Body: { token }
 */
router.post('/verify-token', (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'Token gerekli.' });
    }

    const data = tokenStore.get(token);

    if (!data) {
      return res.status(401).json({ success: false, error: 'Geçersiz token.' });
    }

    if (data.expiresAt < Date.now()) {
      tokenStore.delete(token);
      return res.status(401).json({ success: false, error: 'Token süresi dolmuş.' });
    }

    res.json({
      success: true,
      anime_id: data.anime_id,
      episode_number: data.episode_number,
      remainingTtl: Math.ceil((data.expiresAt - Date.now()) / 1000),
    });
  } catch (error) {
    console.error('[POST /api/secure/verify-token] Error:', error.message);
    res.status(500).json({ success: false, error: 'Token doğrulanamadı.' });
  }
});

module.exports = router;
