const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * GET /api/profile
 * Kullanıcının favori ve geçmiş verilerini getirir
 */
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('favorites', 'tranimeizle_slug orijinal_ad cover_image banner_image description genres average_score season_year anilist_id')
      .populate('watchHistory.anime', 'tranimeizle_slug orijinal_ad cover_image banner_image description genres average_score season_year anilist_id')
      .populate('customLists.animes', 'tranimeizle_slug orijinal_ad cover_image banner_image description genres average_score season_year anilist_id');

    res.status(200).json({
      success: true,
      favorites: user.favorites,
      watchHistory: user.watchHistory,
      customLists: user.customLists,
      avatar: user.avatar
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Veriler alınamadı.' });
  }
});

/**
 * POST /api/profile/favorite
 * Favorilere ekle/çıkar (Toggle)
 */
router.post('/favorite', protect, async (req, res) => {
  try {
    const { animeId } = req.body;
    
    if (!animeId) {
      return res.status(400).json({ success: false, error: 'Anime ID gerekli.' });
    }

    const user = await User.findById(req.user._id);
    const index = user.favorites.indexOf(animeId);

    let isFavorite = false;
    if (index > -1) {
      // Çıkar
      user.favorites.splice(index, 1);
    } else {
      // Ekle
      user.favorites.push(animeId);
      isFavorite = true;
    }

    await user.save();

    res.status(200).json({ success: true, isFavorite, favorites: user.favorites });
  } catch (error) {
    res.status(500).json({ success: false, error: 'İşlem başarısız.' });
  }
});

/**
 * POST /api/profile/history
 * İzleme geçmişine ekle/güncelle
 */
router.post('/history', protect, async (req, res) => {
  try {
    const { animeId, episode, currentTime } = req.body;

    if (!animeId || episode === undefined) {
      return res.status(400).json({ success: false, error: 'Anime ID ve bölüm gerekli.' });
    }

    const user = await User.findById(req.user._id);

    // Daha önce bu anime geçmişte var mı?
    const existingIndex = user.watchHistory.findIndex(h => h.anime.toString() === animeId);

    if (existingIndex > -1) {
      // Sadece bölümü güncelle ve tarihi yenile
      user.watchHistory[existingIndex].episode = episode;
      user.watchHistory[existingIndex].watchedAt = Date.now();
      if (currentTime !== undefined) {
        user.watchHistory[existingIndex].currentTime = currentTime;
      }
      
      // En üste taşı
      const item = user.watchHistory.splice(existingIndex, 1)[0];
      user.watchHistory.unshift(item);
    } else {
      // Yeni ekle
      user.watchHistory.unshift({
        anime: animeId,
        episode: episode,
        currentTime: currentTime || 0,
        watchedAt: Date.now()
      });
    }

    await user.save();

    res.status(200).json({ success: true, watchHistory: user.watchHistory });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Geçmiş güncellenemedi.' });
  }
});

// ── CUSTOM LISTS (ÖZEL LİSTELER) ──────────────────────────

/**
 * POST /api/profile/lists
 * Yeni özel liste oluşturur
 */
router.post('/lists', protect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'Liste adı boş olamaz.' });
    }

    const user = await User.findById(req.user._id);
    user.customLists.push({ name: name.trim(), animes: [] });
    await user.save();

    res.status(200).json({ success: true, customLists: user.customLists });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Liste oluşturulamadı.' });
  }
});

/**
 * DELETE /api/profile/lists/:listId
 * Özel listeyi siler
 */
router.delete('/lists/:listId', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.customLists = user.customLists.filter(list => list._id.toString() !== req.params.listId);
    await user.save();

    res.status(200).json({ success: true, customLists: user.customLists });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Liste silinemedi.' });
  }
});

/**
 * POST /api/profile/lists/anime
 * Bir listeye anime ekler veya çıkarır
 */
router.post('/lists/anime', protect, async (req, res) => {
  try {
    const { listId, animeId } = req.body;
    if (!listId || !animeId) {
      return res.status(400).json({ success: false, error: 'Eksik bilgi gönderildi.' });
    }

    const user = await User.findById(req.user._id);
    const listIndex = user.customLists.findIndex(l => l._id.toString() === listId);
    
    if (listIndex === -1) {
      return res.status(404).json({ success: false, error: 'Liste bulunamadı.' });
    }

    const animeIndex = user.customLists[listIndex].animes.findIndex(a => a.toString() === animeId);
    
    if (animeIndex > -1) {
      // Zaten var, listeden çıkar
      user.customLists[listIndex].animes.splice(animeIndex, 1);
    } else {
      // Listeye ekle
      user.customLists[listIndex].animes.push(animeId);
    }

    await user.save();

    const populatedUser = await User.findById(req.user._id).populate('customLists.animes', 'tranimeizle_slug orijinal_ad cover_image banner_image description genres average_score season_year anilist_id');

    res.status(200).json({ success: true, customLists: populatedUser.customLists });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Anime listeye eklenemedi.' });
  }
});

/**
 * PUT /api/profile/avatar
 * Kullanıcının profil fotoğrafını günceller
 */
router.put('/avatar', protect, async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    
    const user = await User.findById(req.user._id);
    user.avatar = avatarUrl || null;
    await user.save();

    res.status(200).json({ success: true, avatar: user.avatar });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Avatar güncellenemedi.' });
  }
});

/**
 * PUT /api/profile/update-name
 * Kullanıcının adını günceller
 */
router.put('/update-name', protect, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, error: 'İsim alanı boş olamaz.' });
    }

    const user = await User.findById(req.user._id);
    user.name = name.trim();
    await user.save();

    res.status(200).json({
      success: true,
      message: 'İsim başarıyla güncellendi.',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[Update Name Error]', error);
    res.status(500).json({ success: false, error: 'İsim güncellenemedi.' });
  }
});

/**
 * PUT /api/profile/update-email
 * Kullanıcının e-postasını günceller ve yeni e-postaya doğrulama kodu gönderir
 */
router.put('/update-email', protect, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'E-posta adresi gereklidir.' });
    }

    const newEmail = email.toLowerCase().trim();

    // Mevcut email ile aynı mı?
    if (newEmail === req.user.email.toLowerCase()) {
      return res.status(400).json({ success: false, error: 'Yeni e-posta adresi eskisinden farklı olmalıdır.' });
    }

    // Başka bir kullanıcı kullanıyor mu?
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Bu e-posta adresi zaten başka bir hesap tarafından kullanılıyor.' });
    }

    // 6 haneli kod oluştur
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 dakika

    const user = await User.findById(req.user._id);
    user.email = newEmail;
    user.isVerified = false;
    user.verificationCode = code;
    user.verificationCodeExpires = expires;
    await user.save();

    console.log('\n=============================================');
    console.log(`[EMAIL UPDATE VERIFICATION CODE] Email: ${newEmail} -> CODE: ${code}`);
    console.log('=============================================\n');

    // Mail gönder
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY || '');
    
    try {
      await resend.emails.send({
        from: 'Clofthel <no-reply@clofthel.com.tr>',
        to: newEmail,
        subject: 'Clofthel E-posta Değişikliği Doğrulama Kodunuz',
        html: `<div style="font-family: sans-serif; padding: 20px;">
          <h2>Clofthel E-posta Değişikliği</h2>
          <p>Yeni e-posta adresinizi doğrulamak için aşağıdaki 6 haneli kodu kullanın:</p>
          <h1 style="color: #FF6B00; letter-spacing: 5px;">${code}</h1>
          <p>Bu kod 15 dakika geçerlidir.</p>
        </div>`
      });
    } catch (mailErr) {
      console.error('Mail gönderme hatası:', mailErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Doğrulama kodu yeni e-postanıza gönderildi.',
      requiresVerification: true,
      email: newEmail
    });
  } catch (error) {
    console.error('[Update Email Error]', error);
    res.status(500).json({ success: false, error: 'E-posta güncellenemedi.' });
  }
});

/**
 * PUT /api/profile/settings/notifications/favorites
 * Favoriler için bildirimleri açar/kapatır
 */
router.put('/settings/notifications/favorites', protect, async (req, res) => {
  try {
    const { enabled } = req.body;
    const user = await User.findById(req.user._id);
    user.notifyOnFavorites = Boolean(enabled);
    await user.save();
    res.status(200).json({ success: true, notifyOnFavorites: user.notifyOnFavorites });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ayar güncellenemedi.' });
  }
});

/**
 * PUT /api/profile/lists/:listId/notifications
 * Özel liste için bildirimleri açar/kapatır
 */
router.put('/lists/:listId/notifications', protect, async (req, res) => {
  try {
    const { enabled } = req.body;
    const user = await User.findById(req.user._id);
    const listIndex = user.customLists.findIndex(l => l._id.toString() === req.params.listId);
    
    if (listIndex === -1) {
      return res.status(404).json({ success: false, error: 'Liste bulunamadı.' });
    }

    user.customLists[listIndex].notificationsEnabled = Boolean(enabled);
    await user.save();
    
    res.status(200).json({ success: true, customLists: user.customLists });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Ayar güncellenemedi.' });
  }
});

/**
 * POST /api/profile/push-token
 * Kullanıcının Expo Push Token'ını kaydeder
 */
router.post('/push-token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token gereklidir.' });
    }

    const user = await User.findById(req.user._id);
    
    // Eğer token dizide yoksa ekle
    if (!user.expoPushTokens) {
      user.expoPushTokens = [];
    }

    if (!user.expoPushTokens.includes(token)) {
      user.expoPushTokens.push(token);
      await user.save();
    }

    res.status(200).json({ success: true, message: 'Push token kaydedildi.' });
  } catch (error) {
    console.error('Push token kaydetme hatası:', error);
    res.status(500).json({ success: false, error: 'Token kaydedilemedi.' });
  }
});

module.exports = router;
