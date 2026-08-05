require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { connectDatabase } = require('./config/database');
const ingestRoutes = require('./routes/ingestRoutes');

const app = express();
const PORT = process.env.PORT || 5001;

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
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

// Body Parsers with increased payload limit for bulk ingestion
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Initialize Database Connection
connectDatabase();

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'Ingestion & Middleware Routing Service is active',
    role: 'API Gateway / Orchestrator Adapter',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Ingestion Routes (Dual-Dispatch API Gateway)
app.use(ingestRoutes);

// Server Listener
app.listen(PORT, () => {
  console.log(`🚀 [Ingestion & Middleware Routing Service] Running on port ${PORT}`);
  console.log(`🔒 Security: CORS restricted, API key verification active`);
  console.log(`⚡ Dual-Dispatch Adapter: Target A (Legacy Animes) & Target B (Orchestrator) non-blocking routing enabled.`);

  // Self-ping to prevent sleep on free hosting platforms
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
  if (RENDER_URL) {
    console.log(`🏓 Self-ping active: ${RENDER_URL}/health (every 14 mins)`);
    setInterval(async () => {
      try {
        await axios.get(`${RENDER_URL}/health`);
        console.log(`[SELF-PING] OK - ${new Date().toISOString()}`);
      } catch (err) {
        console.warn(`[SELF-PING] Notice: ${err.message}`);
      }
    }, 14 * 60 * 1000);
  }
});
