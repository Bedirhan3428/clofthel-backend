/**
 * Clofthel Backend — Express.js + MongoDB
 * Ana sunucu dosyası (Güvenlik Sertleştirilmiş)
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const animesRouter = require('./routes/animes');
const secureRouter = require('./routes/secure');
const authRouter = require('./routes/auth');
const profileRouter = require('./routes/profile');
const aiRouter = require('./routes/ai');
const notificationsRouter = require('./routes/notifications');
const internalRouter = require('./routes/internal');
const commentsRouter = require('./routes/comments');
const { verifyRequestSignature } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/clofthel';

// ── Güvenlik Middleware'leri ────────────────────────────────────

// 1. Helmet — HTTP güvenlik başlıkları (XSS, Clickjacking, MIME Sniffing koruması)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Mobil app için gerekli
  contentSecurityPolicy: false // Mobil API sunucusu için CSP devre dışı
}));

// 2. CORS — Sadece izin verilen originlerden istek kabul et
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://192.168.1.10:5000',
  'http://192.168.1.10:8081',
  'https://clofthel.com.tr',
  'https://api.clofthel.com.tr',
  'https://scraper.clofthel.com.tr',
  // Expo Go ve React Native bundler'lar tüm yerel IP'lerden gelebilir
];

app.use(cors({
  origin: function (origin, callback) {
    // Mobil uygulamalar (React Native) origin göndermez — izin ver
    if (!origin) return callback(null, true);
    // İzin verilen origin listesinde mi kontrol et
    if (allowedOrigins.includes(origin) || origin.startsWith('http://192.168.') || origin.startsWith('http://10.')) {
      return callback(null, true);
    }
    callback(new Error('CORS policy: Bu origin\'den erişime izin verilmiyor.'));
  },
  credentials: true
}));

// 3. Body Parser — Boyut limiti ile (1MB üzeri payload'ları reddet → DoS koruması)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 3.1 Data Sanitization against NoSQL query injection
app.use(mongoSanitize());

// 3.2 Data Sanitization against XSS
app.use(xss());

// 3.3 Prevent HTTP Parameter Pollution
app.use(hpp());

// 4. Genel Rate Limiter — Tüm API istekleri için (100 istek / 15 dk)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 300, // IP başına 300 istek
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.'
  }
});
app.use('/api/', globalLimiter);

// 5. İstek Loglama (hassas bilgileri loglamadan)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────────────────
// Dinamik İstek İmzası gerektiren rotalar
app.use('/api/animes', verifyRequestSignature, animesRouter);
app.use('/api/secure', verifyRequestSignature, secureRouter);
app.use('/api/auth', verifyRequestSignature, authRouter);
app.use('/api/profile', verifyRequestSignature, profileRouter);
app.use('/api/ai', verifyRequestSignature, aiRouter);
app.use('/api/notifications', verifyRequestSignature, notificationsRouter);

// Internal ve public rotalar
app.use('/api/internal', internalRouter);
app.use('/api/comments', commentsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// App Version Check Endpoint
app.get('/api/version', (req, res) => {
  res.json({
    success: true,
    latestVersion: '1.0.0',
    minRequiredVersion: '1.0.0',
    updateUrl: 'https://clofthel.com.tr/download',
    releaseNotes: 'Performans iyileştirmeleri ve 4K HDR modunda canlılık düzeltmeleri yapıldı.',
    forceUpdate: false
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint bulunamadı.' });
});

// Global Error Handler — Hata detaylarını client'a sızdırmaz
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  
  // CORS hatası
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ success: false, error: 'Bu kaynağa erişim izniniz yok.' });
  }
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Sunucu hatası oluştu.'
      : err.message || 'Sunucu hatası oluştu.'
  });
});

// ── MongoDB Connection + Server Start ──────────────────────────
mongoose
  .connect(MONGO_URI, {
    // IPv4 zorla — Windows'ta Atlas SRV DNS çözümleme hatasını önler
    family: 4,
  })
  .then(() => {
    console.log('✅ MongoDB bağlantısı başarılı');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Clofthel API çalışıyor: http://0.0.0.0:${PORT}`);
      console.log(`🔒 Güvenlik: Helmet, CORS, Rate Limiter aktif`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB bağlantı hatası:', err.message);
    process.exit(1);
  });
