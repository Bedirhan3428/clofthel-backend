/**
 * Clofthel — Merkezi Kimlik Doğrulama Middleware'leri
 * Tüm rotalar tarafından paylaşılır. Tekrar eden kopyaları ortadan kaldırır.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;

// Başlatma kontrolü: JWT_SECRET .env'de tanımlı olmalı
if (!JWT_SECRET) {
  console.error('❌ KRITIK GÜVENLIK HATASI: JWT_SECRET .env dosyasında tanımlı değil!');
  console.error('   Lütfen backend/.env dosyasına güçlü bir JWT_SECRET ekleyin.');
  process.exit(1);
}

/**
 * protect — JWT Bearer token doğrulaması
 * Korunan endpoint'lere yetkisiz erişimi engeller.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Oturum açmanız gerekiyor.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Bu tokene ait kullanıcı bulunamadı.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Token geçersiz veya süresi dolmuş.' });
  }
};

/**
 * apiKeyAuth — Internal API key doğrulaması
 * Scraper servis ve admin endpoint'leri için kullanılır.
 */
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-internal-api-key'];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    console.error('❌ INTERNAL_API_KEY .env dosyasında tanımlı değil!');
    return res.status(500).json({ success: false, error: 'Sunucu yapılandırma hatası.' });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(403).json({ success: false, error: 'Yetkisiz erişim.' });
  }
  next();
};

module.exports = { protect, apiKeyAuth, JWT_SECRET };
