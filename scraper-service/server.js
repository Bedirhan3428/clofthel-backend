require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const mongoose = require('mongoose');
const { runScraper } = require('./sync_homepage');

const app = express();
const PORT = process.env.PORT || 5001;

// Güvenlik: CORS sadece kendi backend'imizden ve kendi alan adımızdan gelen isteklere izin ver
app.use(cors({
  origin: function (origin, callback) {
    // Sadece yerel ağdan ve kendi alan adımızdan gelen istekler
    if (!origin || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://192.168.') || 
        origin.startsWith('http://10.') ||
        origin.includes('clofthel.com.tr')) {
      return callback(null, true);
    }
    callback(new Error('CORS izni yok.'));
  }
}));
app.use(express.json({ limit: '256kb' }));

// MongoDB'ye bağlan
mongoose.connect(process.env.MONGO_URI, { family: 4 })
  .then(() => console.log('✅ MongoDB connected in scraper service'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

app.get('/health', (req, res) => {
  res.json({ status: 'Scraper microservice is running', uptime: process.uptime() });
});

// API key kontrolü middleware
const checkApiKey = (req, res, next) => {
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

// Manuel tetikleme endpoint'i (API key ile korunuyor)
app.post('/api/scrape/trigger', checkApiKey, async (req, res) => {
  try {
    const result = await runScraper();
    res.json({ success: true, message: 'Scraping finished', result });
  } catch (error) {
    console.error('Manual scrape error:', error);
    res.status(500).json({ success: false, error: 'Scraping sırasında hata oluştu.' });
  }
});

// Günde 5 defa belirli saatlerde çalışacak şekilde ayarla (02:00, 08:00, 12:00, 16:00, 20:00)
cron.schedule('0 2,8,12,16,20 * * *', async () => {
  console.log(`[CRON] Starting scheduled scrape at ${new Date().toISOString()}`);
  try {
    await runScraper();
    console.log(`[CRON] Scheduled scrape completed successfully.`);
  } catch (error) {
    console.error(`[CRON] Scheduled scrape failed:`, error);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Scraper Microservice is running on port ${PORT}`);
  console.log(`🔒 Güvenlik: CORS kısıtlı, API key koruması aktif`);
  console.log(`⏰ Cron job scheduled to run 5 times a day (02:00, 08:00, 12:00, 16:00, 20:00).`);
});
