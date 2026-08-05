const express = require('express');
const router = express.Router();
const IngestionController = require('../controllers/IngestionController');
const { verifyApiKey } = require('../middleware/authMiddleware');

/**
 * Endpoint for Termux client and external scrapers/bots.
 * Accepts raw anime/episode payloads, sanitizes them, and dual-dispatches to Legacy DB and Orchestrator.
 */

// Primary Ingestion Endpoints
router.post('/api/v1/scraper/ingest', verifyApiKey, IngestionController.handleIngestion);
router.post('/api/v1/ingest', verifyApiKey, IngestionController.handleIngestion);

// Termux Client Ingestion Endpoint (Compatibility with existing termux_setup.sh)
router.post('/api/internal/bulk-episode-sync', verifyApiKey, IngestionController.handleIngestion);

// Legacy Manual Scrape Trigger / Ingest Endpoint
router.post('/api/scrape/trigger', verifyApiKey, IngestionController.handleIngestion);

module.exports = router;
