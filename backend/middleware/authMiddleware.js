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

/**
 * verifyRequestSignature — HMAC Tabanlı Dinamik İstek İmzalama (Request Signing)
 * Frontend'den gelen x-clofthel-timestamp, x-clofthel-nonce ve x-clofthel-signature 
 * değerlerini kontrol ederek isteğin bütünlüğünü ve yeniliğini doğrular.
 */
const crypto = require('crypto');

const verifyRequestSignature = (req, res, next) => {
  const timestamp = req.headers['x-clofthel-timestamp'];
  const nonce = req.headers['x-clofthel-nonce'];
  const signature = req.headers['x-clofthel-signature'];
  const secret = process.env.MOBILE_APP_SECRET;

  // Stream ve Proxy endpointleri için imzayı bypass et (Video Player'lar HMAC header gönderemez)
  const bypassPaths = ['/stream.m3u8', '/chunk.ts', '/sibnet-proxy'];
  if (bypassPaths.some(p => req.originalUrl.includes(p))) {
    return next();
  }

  if (!secret) {
    console.error('❌ MOBILE_APP_SECRET .env dosyasında tanımlı değil!');
    return res.status(500).json({ success: false, error: 'Sunucu yapılandırma hatası.' });
  }

  if (!timestamp || !nonce || !signature) {
    return res.status(403).json({ success: false, error: 'Güvenlik imzası eksik. Bu API sadece resmi Clofthel mobil uygulaması tarafından kullanılabilir.' });
  }

  // Replay Attack Koruması: 15 saniyeden (15000ms) eski istekleri reddet
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  
  if (isNaN(requestTime) || Math.abs(now - requestTime) > 15000) {
    return res.status(401).json({ success: false, error: 'İstek zaman aşımına uğradı (Replay Attack Koruması).' });
  }

  // İmzayı yeniden hesapla: URL (orijinal url) | timestamp | nonce
  // req.originalUrl, query parametreleri dahil tam path'i verir (örn: /api/animes?limit=10)
  const payload = `${req.originalUrl}|${timestamp}|${nonce}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  if (signature !== expectedSignature) {
    console.warn(`[GÜVENLİK] Geçersiz imza. URL: ${req.originalUrl}`);
    return res.status(401).json({ success: false, error: 'İstek imzası geçersiz veya veri değiştirilmiş.' });
  }

  next();
};

module.exports = { protect, apiKeyAuth, verifyRequestSignature, JWT_SECRET };
